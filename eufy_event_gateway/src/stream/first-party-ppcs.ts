/**
 * Implements one first-party Eufy PPCS UDP media session.
 *
 * PPCS is Eufy's peer-to-peer camera transport, not RTSP and not a Home
 * Assistant protocol. This class performs LAN/cloud lookup, `CAM_CHECK`,
 * command-frame reassembly, HomeBase gateway-info decryption, level-two key
 * setup, heartbeat, video-key exchange, and Annex-B H.264 output. It consumes
 * DSK/cipher material prepared by `EufyProvider` and exposes a readable byte
 * stream plus safe counters, so the rest of the gateway never handles PPCS
 * packet layout or camera encryption directly.
 */
import { createCipheriv, createDecipheriv, createECDH, createHmac, generateKeyPairSync, privateDecrypt, randomBytes } from "node:crypto";
import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import { PassThrough } from "node:stream";

// PPCS wraps command payloads in an XZYH header. The outer D1 datagrams and
// these inner command frames use different sequence numbers and byte order.
const MAGIC = Buffer.from("XZYH", "ascii");
const REQ = {
  lookup: Buffer.from([0xf1, 0x26]),
  localLookup: Buffer.from([0xf1, 0x30]),
  check: Buffer.from([0xf1, 0x41]),
  ping: Buffer.from([0xf1, 0xe0]),
  data: Buffer.from([0xf1, 0xd0]),
  ack: Buffer.from([0xf1, 0xd1]),
  end: Buffer.from([0xf1, 0xf0]),
} as const;
const RESP = {
  lookupAddr: Buffer.from([0xf1, 0x40]),
  localLookup: Buffer.from([0xf1, 0x41]),
  camId: Buffer.from([0xf1, 0x42]),
  pong: Buffer.from([0xf1, 0xe1]),
  data: Buffer.from([0xf1, 0xd0]),
} as const;
const DATA = { data: Buffer.from([0xd1, 0]), video: Buffer.from([0xd1, 1]) } as const;

/** Station and camera values required to establish one PPCS media session. */
export interface PpcsCameraOptions {
  readonly stationSerial: string;
  readonly p2pDid: string;
  readonly appConnection: string;
  readonly dskKey: string;
  readonly channel: number;
  readonly cameraModel: string;
  readonly accountId: string | null;
  readonly homeBaseAttached?: boolean;
  readonly resolveCipherKey?: (cipherId: number) => Promise<string | undefined>;
  readonly maxSeconds?: number;
}

/**
 * One bounded, first-party PPCS camera session that emits Annex-B video on
 * `output`.
 *
 * It handles the HomeBase camera path: DSK lookup, CAM_CHECK, level-one
 * gateway-info decryption, level-two media start, and Annex-B H.264
 * extraction. It has no dependency on eufy-security-client or the expiring
 * Web Portal PIN.
 *
 * `start` resolves after the peer answers the lookup, not after the first video
 * frame. A camera can therefore be reachable while still failing later during
 * key unwrap or media start. The public stats object makes that distinction
 * visible in diagnostics.
 */
export class FirstPartyPpcsSession {
  readonly output = new PassThrough();
  readonly stats = { camId: 0, dataDatagrams: 0, frameHeaders: 0, gatewayInfo: 0, level2: 0, videoFrames: 0, firstDataHex: "", cipherId: 0, level2Error: "", commands: [] as number[], responseLengths: [] as number[], startHex: "", types: [] as number[] };
  readonly #options: PpcsCameraOptions;
  readonly #socket: Socket = createSocket("udp4");
  readonly #rsa = generateKeyPairSync("rsa", { modulusLength: 1024 });
  #remote: { host: string; port: number } | null = null;
  #seq = 0;
  #closed = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #pendingByType = new Map<number, Buffer>();
  #videoKey: Buffer | null = null;
  #level2Key: Buffer | null = null;
  #level2Seq = 0;
  #gatewayPromise: Promise<void> | null = null;
  #lastSequenceByType = new Map<number, number>();
  #heartbeat: ReturnType<typeof setInterval> | null = null;

  /** Create a session; no socket is bound until {@link start} runs. */
  constructor(options: PpcsCameraOptions) { this.#options = options; }

  /** Bind UDP, perform lookup and handshake, then start heartbeats. */
  async start(): Promise<void> {

    // Bind an ephemeral UDP port, then try LAN and cloud lookup addresses. A
    // successful CAM_ID response means the peer is reachable, not that video
    // has started yet.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("PPCS camera lookup timed out")), 20_000);
      this.#socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
      this.#socket.on("message", (message, info) => {
        try {
          if (this.#handle(message, info)) { clearTimeout(timeout); resolve(); }
        } catch (error) { clearTimeout(timeout); reject(error); }
      });
      this.#socket.bind(0, () => {
        this.#socket.setBroadcast(true);
        this.#lookup();
      });
    });
    this.#timer = setTimeout(() => this.close(), (this.#options.maxSeconds ?? 30) * 1_000);
    this.#heartbeat = setInterval(() => {
      if (!this.#remote) return;
      this.#send(REQ.ping, Buffer.alloc(0), this.#remote);
      if (this.#options.homeBaseAttached && this.#level2Key) this.#startAttachedMedia();
      else if (!this.#options.homeBaseAttached) this.#sendCommand(1139, voidPayload(this.#options.channel));
    }, 5_000);
    this.#heartbeat.unref?.();
  }

  /** End the peer session, timers, socket, and output stream idempotently. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    if (this.#remote) this.#send(REQ.end, Buffer.alloc(0), this.#remote);
    this.#socket.close();
    this.output.end();
  }

  #lookup(): void {
    const local = Buffer.from([0, 0]);
    this.#send(REQ.localLookup, local, { host: "255.255.255.255", port: 32108 });
    for (const address of decodeCloudAddresses(this.#options.appConnection)) {
      const payload = Buffer.concat([encodeDid(this.#options.p2pDid), Buffer.from([0, 2]), u16(this.#socket.address().port), Buffer.from([0, 0, 0, 0]), Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 0, 0]), Buffer.from(this.#options.dskKey), Buffer.alloc(4)]);
      this.#send(REQ.lookup, payload, address);
    }
  }

  #handle(message: Buffer, info: RemoteInfo): boolean {
    if (has(message, RESP.localLookup)) {
      const did = decodeDid(message.subarray(4, 24));
      if (did === this.#options.p2pDid) this.#check({ host: info.address, port: info.port });
      return false;
    }
    if (has(message, RESP.lookupAddr) && message.length >= 12) {
      const port = message.readUInt16LE(6); const host = `${message[11]}.${message[10]}.${message[9]}.${message[8]}`;
      if (host !== "0.0.0.0") this.#check({ host, port });
      return false;
    }
    if (has(message, RESP.camId)) {
      if (this.#remote) return false;
      this.stats.camId++;
      this.#remote = { host: info.address, port: info.port };
      this.#send(REQ.ping, Buffer.alloc(0), this.#remote);
      this.#sendCommand(1100, voidPayload(255));
      if (!this.#options.homeBaseAttached) this.#startOwnMedia();
      return true;
    }
    if (has(message, RESP.pong)) return false;
    if (has(message, RESP.data) && this.#remote) {
      this.stats.dataDatagrams++;
      if (!this.stats.firstDataHex) this.stats.firstDataHex = message.subarray(0, Math.min(message.length, 48)).toString("hex");
      const type = message.subarray(4, 6); const seq = message.readUInt16BE(6);
      if (!this.stats.types.includes(type[1] ?? -1)) this.stats.types.push(type[1] ?? -1);
      this.#send(REQ.ack, Buffer.concat([type, u16(1), u16(seq)]), this.#remote);
      const dataType = type[1] ?? 0;
      if (type.equals(DATA.video) || type.equals(DATA.data) || dataType === 2) this.#consumeData(message.subarray(8), seq, dataType);
    }
    return false;
  }

  #consumeData(data: Buffer, sequence: number, type: number): void {
    const previous = this.#lastSequenceByType.get(type);
    if (previous !== undefined && ((sequence - previous) & 0xffff) > 1) this.#pendingByType.delete(type);
    this.#lastSequenceByType.set(type, sequence);
    let pending = Buffer.concat([this.#pendingByType.get(type) ?? Buffer.alloc(0), data]);
    while (pending.length >= 16 && pending.subarray(0, 4).equals(MAGIC)) {
      const command = pending.readUInt16LE(4);
      if (this.stats.commands.length < 20) this.stats.commands.push(command);
      const size = pending.readUInt32LE(6);
      if (command === 1350 && this.stats.responseLengths.length < 5) this.stats.responseLengths.push(size);
      const signCode = pending[13] ?? 0;
      if (size > 16 * 1024 * 1024) { this.#pendingByType.delete(type); return; }
      if (pending.length < 16 + size) { this.#pendingByType.set(type, pending); return; }
      const payload = pending.subarray(16, 16 + size);
      this.stats.frameHeaders++;
      pending = pending.subarray(16 + size);

      // 1100 carries the encrypted HomeBase gateway details. 1300 carries
      // media frames after the level-2 request has been accepted.
      if (command === 1100 && signCode === 1) { this.stats.gatewayInfo++; void this.#handleGatewayInfo(payload); }
      else if (command === 1300) { this.stats.videoFrames++; this.#writeVideo(payload, signCode); }
    }
    this.#pendingByType.set(type, pending);
  }

  #writeVideo(frame: Buffer, signCode: number): void {
    if (frame.length < 22) return;
    const length = frame.readUInt32LE(0); const encryptedKey = frame.subarray(22, 150);
    let start = 22;
    if (signCode > 0 && encryptedKey.length === 128 && frame[4] === 1) {
      try { this.#videoKey = privateDecrypt({ key: this.#rsa.privateKey, padding: 1 }, encryptedKey); start = 150 + 1; } catch { return; }
    }
    const encrypted = frame.subarray(start, Math.min(frame.length, start + Math.min(length, 128)));
    const clear = this.#videoKey && encrypted.length === 128 ? decryptEcb(encrypted, this.#videoKey) : encrypted;
    const tail = frame.subarray(start + encrypted.length, Math.min(frame.length, start + length));
    const video = Buffer.concat([clear, tail]);
    if (video.length > 0) this.output.write(video);
  }

  async #handleGatewayInfo(payload: Buffer): Promise<void> {
    if (this.#gatewayPromise) return this.#gatewayPromise;
    if (!this.#options.homeBaseAttached || this.#level2Key || !this.#options.resolveCipherKey || payload.length < 133) return;
    this.#gatewayPromise = this.#deriveLevel2(payload);
    try { await this.#gatewayPromise; } finally { this.#gatewayPromise = null; }
  }

  async #deriveLevel2(payload: Buffer): Promise<void> {
    let plainPayload: Buffer;
    try { plainPayload = decryptEcb(payload, commandKey(this.#options.stationSerial, this.#options.p2pDid)); } catch (error) { this.stats.level2Error = `gateway decrypt failed: ${error instanceof Error ? error.message : String(error)}`; return; }
    const cipherId = plainPayload.readUInt16LE(0);
    this.stats.cipherId = cipherId;
    let eccPrivateKey: string | undefined;
    try { eccPrivateKey = await this.#options.resolveCipherKey!(cipherId); } catch (error) { this.stats.level2Error = error instanceof Error ? error.message : String(error); return; }
    if (!eccPrivateKey) { this.stats.level2Error = "no ECC private key"; return; }
    const plain = unwrapGatewayInfo(plainPayload.subarray(4, 133), eccPrivateKey);
    if (!plain || plain.length < 32) { this.stats.level2Error = "gateway info ECIES unwrap failed"; return; }
    this.#level2Key = plain.subarray(0, 32);
    this.stats.level2++;
    this.#startAttachedMedia();
  }

  #startAttachedMedia(): void {
    if (!this.#remote || !this.#level2Key) return;
    const key = publicModulus(this.#rsa.publicKey);
    const value = JSON.stringify({
      account_id: this.#options.accountId ?? "",
      cmd: 1003,
      mChannel: this.#options.channel,
      mValue3: 1003,
      payload: { ClientOS: "Android", accountId: this.#options.accountId ?? "", camera_type: 0, entrytype: 0, key, streamtype: 1 },
    });

    // The level-2 body is AES-GCM encrypted. The RSA modulus inside the JSON
    // lets the camera establish the per-stream video key for frame payloads.
    const level2Sequence = this.#level2Seq++;
    const body = encryptLevel2(Buffer.from(value), this.#level2Key, level2Sequence);
    const streamId = this.#options.channel === 0 || this.#options.channel === 255 ? 0 : 10 + (this.#level2Seq & 127);
    const header = commandHeader(this.#seq++, 1350);
    const packet = Buffer.concat([header, rawPayload(body, this.#options.channel, 8, [8, 0], streamId)]);
    if (!this.stats.startHex) this.stats.startHex = packet.subarray(0, 32).toString("hex");
    this.#send(REQ.data, packet, this.#remote);
  }

  #startOwnMedia(): void {
    const key = publicModulus(this.#rsa.publicKey);
    const now = Date.now();
    const value = JSON.stringify({ commandType: 1000, data: {
      cmd: 1000, account_id: this.#options.accountId ?? "", accountId: this.#options.accountId ?? "",
      mValueStrSub: this.#options.accountId ?? "", mChannel: this.#options.channel, mValue3: 0, mValue5: 0,
      msg_id: 1, camera_type: 0, entrytype: 0, extValue: 1000, ivalue: 1, restore: 0, streamtype: 2,
      video_type: 12, timestamp: now, transaction: `${now}`, encryptkey: key,
    } });
    this.#sendCommand(1700, stringPayload(value, this.#options.channel, commandKey(this.#options.stationSerial, this.#options.p2pDid)));
  }

  #check(address: { host: string; port: number }): void { this.#send(REQ.check, Buffer.concat([encodeDid(this.#options.p2pDid), Buffer.alloc(3)]), address); }
  #sendCommand(command: number, payload: Buffer): void {
    if (!this.#remote) return;
    const header = Buffer.concat([DATA.data, u16(this.#seq++), MAGIC, u16le(command)]);
    this.#send(REQ.data, Buffer.concat([header, payload]), this.#remote);
  }
  #send(type: Buffer, payload: Buffer, address: { host: string; port: number }): void {
    this.#socket.send(Buffer.concat([type, u16(payload.length), payload]), address.port, address.host);
  }
}

function stringPayload(value: string, channel: number, key: Buffer): Buffer {
  const bytes = Buffer.from(value); const plain = Buffer.alloc(Math.ceil(Math.max(bytes.length, 16) / 16) * 16); bytes.copy(plain);
  const cipher = createCipheriv("aes-128-ecb", key, null); cipher.setAutoPadding(false); const padded = Buffer.concat([cipher.update(plain), cipher.final()]);
  const result = Buffer.alloc(10 + padded.length); result.writeUInt16LE(padded.length, 0); result.writeUInt16LE(1, 4); result[6] = channel; result[7] = 0; padded.copy(result, 10); return result;
}
function voidPayload(channel: number): Buffer { const result = Buffer.alloc(10); result.writeUInt16LE(1, 4); result[6] = channel; return result; }
function commandHeader(sequence: number, command: number): Buffer {
  const result = Buffer.concat([DATA.data, u16(sequence), MAGIC, Buffer.alloc(2)]);
  result.writeUInt16LE(command, 8);
  return result;
}
function rawPayload(data: Buffer, channel: number, signCode: number, magic: readonly [number, number], streamId: number): Buffer {
  const result = Buffer.alloc(10 + data.length);
  result.writeUInt16LE(data.length, 0); result[4] = magic[0]; result[5] = magic[1];
  result[6] = channel & 0xff; result[7] = signCode & 0xff; result[8] = streamId & 0xff;
  data.copy(result, 10); return result;
}
function encryptLevel2(plaintext: Buffer, key: Buffer, sequence: number): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from("eufy security", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([cipher.getAuthTag(), nonce, Buffer.from([sequence & 0xff, 3, 2, 1]), ciphertext]);
}
function unwrapGatewayInfo(envelope: Buffer, privateKeyHex: string): Buffer | undefined {
  try {
    if (envelope.length < 129) return undefined;
    const ephemeral = envelope.subarray(0, 33);
    const iv = envelope.subarray(33, 49);
    const ciphertext = envelope.subarray(49, 97);
    const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(Buffer.from(privateKeyHex, "hex"));
    const shared = ecdh.computeSecret(ephemeral);
    const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();
    const label = Buffer.from("ECIES"); let t = label; let output = Buffer.alloc(0);
    while (output.length < 48) { t = hmac(shared, t); output = Buffer.concat([output, hmac(shared, Buffer.concat([t, label]))]); }
    const decrypt = createDecipheriv("aes-128-cbc", output.subarray(0, 16), iv); decrypt.setAutoPadding(false);
    return Buffer.concat([decrypt.update(ciphertext), decrypt.final()]);
  } catch { return undefined; }
}
function publicModulus(key: ReturnType<typeof generateKeyPairSync>["publicKey"]): string { const jwk = key.export({ format: "jwk" }) as { n: string }; return Buffer.from(jwk.n, "base64url").toString("hex").replace(/^00/, ""); }
function u16(value: number): Buffer { const b = Buffer.alloc(2); b.writeUInt16BE(value); return b; }
function u16le(value: number): Buffer { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function has(value: Buffer, header: Buffer): boolean { return value.subarray(0, 2).equals(header); }
function commandKey(serial: string, did: string): Buffer { return Buffer.from(`${serial.slice(-7)}${did.substring(did.indexOf("-"), did.indexOf("-") + 9)}`); }
function decryptEcb(value: Buffer, key: Buffer): Buffer { const decipher = createDecipheriv(`aes-${key.length * 8}-ecb`, key, null); decipher.setAutoPadding(false); return Buffer.concat([decipher.update(value), decipher.final()]); }
function encodeDid(value: string): Buffer { const [a, b, c] = value.split("-"); const result = Buffer.alloc(20); Buffer.from(a ?? "").copy(result); result.writeUInt32BE(Number(b ?? 0), 8); Buffer.from(c ?? "").copy(result, 12); return result; }
function decodeDid(value: Buffer): string { return `${value.subarray(0, 8).toString().replace(/\0+$/g, "")}-${value.readUInt32BE(8).toString().padStart(6, "0")}-${value.subarray(12, 20).toString().replace(/\0+$/g, "")}`; }
function decodeCloudAddresses(value: string): { host: string; port: number }[] {
  const table = Buffer.from("4959433db5bf6da347534f6165e371e9677f02030badb3892b2f35c16b8b959711e5a70deff1050783fb9d3bc5c713171d1f2529d3df", "hex");
  const encoded = value.split(":", 1)[0] ?? ""; const out = Buffer.alloc(Math.floor(encoded.length / 2));
  for (let i = 0; i < out.length; i++) { let z = 57; for (let j = 0; j < i; j++) z ^= out[j]!; out[i] = z ^ table[i % table.length]! ^ ((encoded.charCodeAt(i * 2) - 65) * 16 + encoded.charCodeAt(i * 2 + 1) - 65); }
  return out.toString().split(",").filter(Boolean).map((host) => ({ host, port: 32100 }));
}
