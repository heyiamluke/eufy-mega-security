/**
 * Contains pure cryptographic helpers for the separate Eufy Web API.
 *
 * The Web portal uses different preset keys, signatures, public-key
 * encryption, and envelope shapes from Mega. Keeping those algorithms apart
 * prevents an experiment with the expiring web session from changing the
 * production native-account code. The functions perform no network or file
 * I/O.
 */
import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  createHmac,
  randomBytes,
  randomUUID,
  type ECDH,
} from "node:crypto";

/** Preset key used to bootstrap identities on the separate Web API. */
export const WEB_PRESET_KEY = "218c12c81e211149304bd70a0c071d03";

/** Web login server public key used to encrypt the password envelope. */
export const WEB_PASSWORD_PUBLIC_KEY =
  "04c5c00c4f8d1197cc7c3167c52bf7acb054d722f0ef08dcd7e0883236e0d72a3868d9750cb47fa4619248f3d83f0f662671dadc6e2d31c2f41db0161651c7c076";

/** Client ECDH key pair used by a Web API login or request identity. */
export interface WebKeyPair {
  readonly privateKey: string;
  readonly publicKey: string;
}

/** Web request key pair plus the server-derived request identity. */
export interface WebRequestIdentity extends WebKeyPair {
  readonly keyIdent: string;
  readonly sharedKey: string;
}

/** Generate a fresh Web API ECDH key pair. */
export function webKeyPair(): WebKeyPair {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { privateKey: ecdh.getPrivateKey("hex"), publicKey: ecdh.getPublicKey("hex") };
}

/** Derive the Web API AES key from a client/server ECDH pair. */
export function deriveWebKey(privateKey: string, publicKey: string, first16 = false): string {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateKey, "hex");
  const shared = padSecret(ecdh, publicKey);
  return (first16 ? shared.subarray(0, 16) : shared).toString("hex");
}

/** Encrypt a Web API envelope using its AES-CBC text format. */
export function encryptWebEnvelope(value: string, key: string, includeRandomIv = true): string {
  const keyBytes = Buffer.from(key, "hex");
  const iv = includeRandomIv ? randomBytes(16) : keyBytes.subarray(0, 16);
  const cipher = createCipheriv(`aes-${keyBytes.length * 8}-cbc`, keyBytes, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return (includeRandomIv ? Buffer.concat([iv, encrypted]) : encrypted).toString("base64");
}

/** Decrypt a Web API envelope and return its UTF-8 contents. */
export function decryptWebEnvelope(value: string, key: string, includesIv = true): string {
  const keyBytes = Buffer.from(key, "hex");
  const encrypted = Buffer.from(value, "base64");
  const iv = includesIv ? encrypted.subarray(0, 16) : keyBytes.subarray(0, 16);
  const body = includesIv ? encrypted.subarray(16) : encrypted;
  const decipher = createDecipheriv(`aes-${keyBytes.length * 8}-cbc`, keyBytes, iv);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/** Sign a Web API request using its timestamp, nonce, and encrypted body. */
export function webRequestSignature(key: string, timestamp: string, nonce: string, data: string): string {
  return createHmac("sha256", key).update(`${timestamp}+${nonce}+${data}`).digest("hex");
}

/** Generate the UUID-like identifier expected by the Web API headers. */
export function randomWebIdentifier(): string {
  return randomUUID().replaceAll("-", "");
}

function padSecret(ecdh: ECDH, publicKey: string): Buffer {
  const shared = ecdh.computeSecret(Buffer.from(publicKey, "hex"));
  return shared.length < 32 ? Buffer.concat([Buffer.alloc(32 - shared.length), shared]) : shared;
}
