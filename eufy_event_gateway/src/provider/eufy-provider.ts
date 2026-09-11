import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

import {
  EufySecurity,
  PropertyName,
  type Device,
  type Picture,
  type PropertyValue,
  type StreamMetadata,
  type PushMessage,
  type MegaHTTPApi,
} from "eufy-security-client";

import type { InventoryDiagnostic } from "../domain/types.js";
import type { CameraProvider, CaptchaChallenge, CaptchaProvider, ProviderEvents } from "./provider.js";

export interface EufyProviderConfig {
  readonly username: string;
  readonly password: string;
  readonly country: string;
  readonly persistentDirectory: string;
  readonly verifyCode?: string;
  readonly maxStreamSeconds: number;
}

export class EufyProvider implements CameraProvider, CaptchaProvider {
  #client: EufySecurity | null = null;
  readonly #knownCameraSerials = new Set<string>();
  readonly #pushOnlyCameraSerials = new Set<string>();
  readonly #pushSnapshotQueues = new Map<string, Promise<void>>();
  #captchaChallenge: CaptchaChallenge | null = null;
  #megaOnlyActive = false;
  #megaOnlyActivation: Promise<boolean> | null = null;

  constructor(private readonly config: EufyProviderConfig) {}

  async start(events: ProviderEvents): Promise<void> {
    await mkdir(this.config.persistentDirectory, { recursive: true, mode: 0o700 });
    const client = await EufySecurity.initialize({
      username: this.config.username,
      password: this.config.password,
      country: this.config.country,
      language: "en",
      trustedDeviceName: "Home Assistant Eufy Gateway",
      persistentDir: this.config.persistentDirectory,
      p2pConnectionSetup: 0,
      pollingIntervalMinutes: 10,
      eventDurationSeconds: 10,
      acceptInvitations: true,
      deviceConfig: { simultaneousDetections: true },
    });
    this.#client = client;
    client.setCameraMaxLivestreamDuration(this.config.maxStreamSeconds);
    this.#wireEvents(client, events);
    const options = this.config.verifyCode ? { verifyCode: this.config.verifyCode, force: true } : undefined;
    await client.connect(options);
  }

  async startStream(serial: string): Promise<void> {
    if (!this.#client) throw new Error("Eufy provider is not connected");
    await this.#client.startStationLivestream(serial);
  }

  async stopStream(serial: string): Promise<void> {
    if (!this.#client) return;
    await this.#client.stopStationLivestream(serial);
  }

  async close(): Promise<void> {
    this.#client?.close();
    this.#client = null;
  }

  getCaptchaChallenge(): CaptchaChallenge | null {
    return this.#captchaChallenge;
  }

  async submitCaptcha(answer: string): Promise<void> {
    if (!this.#client || !this.#captchaChallenge) throw new Error("No Eufy CAPTCHA is waiting for an answer");
    const challenge = this.#captchaChallenge;
    this.#captchaChallenge = null;
    try {
      await this.#client.connect({
        captcha: { captchaId: challenge.id, captchaCode: answer },
        force: true,
      });
    } catch (error) {
      this.#captchaChallenge = challenge;
      throw error;
    }
  }

  #wireEvents(client: EufySecurity, events: ProviderEvents): void {
    client.on("connect", () => {
      this.#megaOnlyActive = false;
      events.connection("connected", null);
      void this.#discoverCameras(client, events);
    });
    client.on("close", () => {
      if (!this.#megaOnlyActive) events.connection("disconnected", null);
    });
    client.on("connection error", (error) => {
      void this.#activateMegaOnly(client, events).then((active) => {
        if (!active) events.connection("error", safeError(error));
      });
    });
    client.on("tfa request", () => {
      void this.#activateMegaOnly(client, events).then((active) => {
        if (!active) events.connection("authentication-required", "Eufy requested an email verification code");
      });
    });
    client.on("captcha request", (id, image) => {
      void this.#activateMegaOnly(client, events).then((active) => {
        if (active) return;
        this.#captchaChallenge = { id, image };
        events.connection("authentication-required", "Open the app web interface to complete Eufy's CAPTCHA");
      });
    });
    client.on("push message", (message: PushMessage) => {
      const derivedPersonName = personNameFromPush(message);
      events.pushDiagnostic({
        receivedAt: new Date().toISOString(),
        cameraSerial: message.device_sn,
        cameraName: safeLabel(message.name),
        type: message.type ?? null,
        eventType: message.event_type ?? null,
        messageType: message.msg_type ?? null,
        notificationStyle: message.notification_style ?? null,
        personName: derivedPersonName,
        hasPersonName: derivedPersonName !== null,
        hasPictureUrl: typeof message.pic_url === "string" && message.pic_url.length > 0,
        hasFilePath: typeof message.file_path === "string" && message.file_path.length > 0,
        hasFetchId: message.fetch_id !== undefined,
        hasSenseId: message.sense_id !== undefined,
      });
      const isDetection = isCameraDetection(message.event_type);
      if (!this.#knownCameraSerials.has(message.device_sn) && isDetection) {
        this.#knownCameraSerials.add(message.device_sn);
        this.#pushOnlyCameraSerials.add(message.device_sn);
        events.camera({
          serial: message.device_sn,
          name: safeLabel(message.name) ?? `Eufy camera ${message.device_sn.slice(-4)}`,
          model: "HomeBase 3 push-only camera",
          stationSerial: message.station_sn,
          streamSupported: false,
        });
      }
      if (this.#pushOnlyCameraSerials.has(message.device_sn) && isDetection) {
        if (message.event_type === 3101) events.motion(message.device_sn, true);
        else events.person(message.device_sn, true, derivedPersonName);
        if (message.pic_url) this.#queuePushSnapshot(client, events, message);
      }
    });
    client.on("device added", (device) => this.#registerIfCamera(device, events));
    client.on("device motion detected", (device, detected) => events.motion(device.getSerial(), detected));
    client.on("device person detected", (device, detected, person) => {
      events.person(device.getSerial(), detected, person || null);
    });
    client.on("device property changed", (device: Device, name: string, value: PropertyValue) => {
      if (name !== PropertyName.DevicePicture || !isPicture(value)) return;
      events.snapshot(device.getSerial(), value.data, value.type.mime);
    });
    client.on(
      "station livestream start",
      (_station, device, _metadata: StreamMetadata, video: Readable) => events.streamStarted(device.getSerial(), video),
    );
    client.on("station livestream stop", (_station, device) => events.streamStopped(device.getSerial()));
  }

  async #activateMegaOnly(client: EufySecurity, events: ProviderEvents): Promise<boolean> {
    if (this.#megaOnlyActive) return true;
    if (this.#megaOnlyActivation) return this.#megaOnlyActivation;

    this.#megaOnlyActivation = (async () => {
      if (!await hasValidMegaSession(client as unknown as MegaSessionClient)) return false;

      this.#megaOnlyActive = true;
      this.#captchaChallenge = null;
      events.connection("connected", "Connected through Eufy's current API; legacy login is unavailable");
      const megaDevices = await this.#getMegaInventory(client);
      events.inventory(mergeInventoryDiagnostics([], megaDevices));
      this.#registerMegaCameras(megaDevices, events);
      await client.registerPushNotifications(undefined, client.getPushPersistentIds());
      return true;
    })().catch((error: unknown) => {
      this.#megaOnlyActive = false;
      console.warn(`Eufy Mega-only startup failed: ${safeError(ensureError(error))}`);
      return false;
    }).finally(() => {
      this.#megaOnlyActivation = null;
    });

    return this.#megaOnlyActivation;
  }

  #queuePushSnapshot(client: EufySecurity, events: ProviderEvents, message: PushMessage): void {
    const serial = message.device_sn;
    const previous = this.#pushSnapshotQueues.get(serial) ?? Promise.resolve();
    const current = previous.then(async () => {
      const picture = await downloadPushSnapshot(client, message);
      if (picture) events.snapshot(serial, picture.data, picture.type.mime);
    }).catch((error: unknown) => {
      // Do not include the signed media URL or raw notification in logs.
      console.warn(`Eufy push snapshot unavailable for ${serial}: ${safeError(ensureError(error))}`);
    });
    this.#pushSnapshotQueues.set(serial, current);
    void current.then(() => {
      if (this.#pushSnapshotQueues.get(serial) === current) this.#pushSnapshotQueues.delete(serial);
    });
  }

  async #discoverCameras(client: EufySecurity, events: ProviderEvents): Promise<void> {
    const devices = await client.getDevices();
    const legacyDiagnostics: InventoryDiagnostic[] = devices.map((device) => ({
      serial: device.getSerial(),
      name: device.getName(),
      model: device.getModel(),
      sources: ["legacy"],
      upstreamIsCamera: device.isCamera(),
      acceptedAsCamera: isSupportedCameraDevice(device.isCamera(), device.getModel(), device.getSerial()),
      megaDeviceType: null,
      category: null,
    }));
    for (const device of devices) this.#registerIfCamera(device, events);

    const megaDevices = await this.#getMegaInventory(client);
    events.inventory(mergeInventoryDiagnostics(legacyDiagnostics, megaDevices));
    this.#registerMegaCameras(megaDevices, events);
  }

  #registerMegaCameras(megaDevices: readonly MegaInventoryDevice[], events: ProviderEvents): void {
    for (const device of megaDevices) {
      if (this.#knownCameraSerials.has(device.serial) || !isSupportedMegaCamera(device)) continue;
      this.#knownCameraSerials.add(device.serial);
      this.#pushOnlyCameraSerials.add(device.serial);
      events.camera({
        serial: device.serial,
        name: device.name,
        model: device.model,
        stationSerial: device.parentSerial,
        streamSupported: false,
      });
    }
  }

  #registerIfCamera(device: Device, events: ProviderEvents): void {
    if (!isSupportedCameraDevice(device.isCamera(), device.getModel(), device.getSerial())) return;
    this.#knownCameraSerials.add(device.getSerial());
    if (requiresPushFallback(device.isCamera(), device.getModel(), device.getSerial())) {
      this.#pushOnlyCameraSerials.add(device.getSerial());
    } else {
      this.#pushOnlyCameraSerials.delete(device.getSerial());
    }
    events.camera({
      serial: device.getSerial(),
      name: device.getName(),
      model: device.getModel(),
      stationSerial: device.getStationSerial(),
      streamSupported: !requiresPushFallback(device.isCamera(), device.getModel(), device.getSerial()),
    });
  }

  async #getMegaInventory(client: EufySecurity): Promise<MegaInventoryDevice[]> {
    try {
      const transition = (client as unknown as MegaEnabledClient).megaTransition;
      if (!transition) return [];
      const mega = await transition.getMegaApi();
      if (!mega.hasValidSession()) return [];
      const response = await mega.callDecrypted("house", "/app/house/get_devs_list", {
        house_id: "",
        device_sns: {},
      });
      return parseMegaInventory(response);
    } catch (error) {
      console.warn(`Eufy Mega inventory unavailable; continuing with legacy inventory: ${safeError(ensureError(error))}`);
      return [];
    }
  }
}

interface PushImageClient {
  getApi(): {
    request(
      request: { method: "GET"; endpoint: string; responseType: "buffer" },
      withoutUrlPrefix: boolean,
    ): Promise<{ status: number; data: unknown }>;
  };
  getStation(stationSerial: string): Promise<{ getRawStation(): { p2p_did: string } }>;
}

type ImageDecoder = (p2pDid: string, data: Buffer) => Promise<Buffer>;

/** Download and decode the signed event image for a camera absent from legacy inventory. */
export async function downloadPushSnapshot(
  client: PushImageClient,
  message: Pick<PushMessage, "device_sn" | "station_sn" | "pic_url">,
  decoder: ImageDecoder = loadUpstreamImageDecoder,
): Promise<Picture | null> {
  const mediaUrl = message.pic_url;
  if (!mediaUrl) return null;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(mediaUrl);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== "https:") return null;

  const response = await client.getApi().request(
    { method: "GET", endpoint: mediaUrl, responseType: "buffer" },
    true,
  );
  if (response.status !== 200 || !Buffer.isBuffer(response.data) || response.data.length === 0) return null;
  if (response.data.length > 20 * 1024 * 1024) throw new Error("event image exceeds the 20 MB safety limit");

  let image = response.data;
  if (!isJpeg(image)) {
    const station = await client.getStation(message.station_sn);
    image = await decoder(station.getRawStation().p2p_did, image);
  }
  if (!isJpeg(image)) throw new Error("event image is not a valid JPEG");
  return { data: image, type: { ext: "jpg", mime: "image/jpeg" } };
}

async function loadUpstreamImageDecoder(p2pDid: string, data: Buffer): Promise<Buffer> {
  // The pinned client exposes its decoder internally but not from its public package entrypoint.
  const require = createRequire(import.meta.url);
  const packageDirectory = dirname(require.resolve("eufy-security-client/package.json"));
  const moduleUrl = pathToFileURL(join(packageDirectory, "build/http/utils.js")).href;
  const decoderModule = await import(moduleUrl) as { decodeImageAsync?: ImageDecoder };
  if (!decoderModule.decodeImageAsync) throw new Error("Eufy image decoder is unavailable");
  return decoderModule.decodeImageAsync(p2pDid, data);
}

function isJpeg(data: Buffer): boolean {
  return data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data.at(-2) === 0xff && data.at(-1) === 0xd9;
}

interface MegaEnabledClient {
  readonly megaTransition?: {
    getMegaApi(): Promise<MegaHTTPApi>;
  };
}

interface MegaSessionClient {
  readonly megaTransition?: {
    getMegaApi(): Promise<Pick<MegaHTTPApi, "hasValidSession">>;
  };
}

export async function hasValidMegaSession(client: MegaSessionClient): Promise<boolean> {
  const transition = client.megaTransition;
  if (!transition) return false;
  return (await transition.getMegaApi()).hasValidSession();
}

export interface MegaInventoryDevice {
  readonly serial: string;
  readonly name: string;
  readonly model: string;
  readonly parentSerial: string;
  readonly deviceType: number | null;
  readonly category: string | null;
}

export function parseMegaInventory(response: unknown): MegaInventoryDevice[] {
  if (!isRecord(response) || !Array.isArray(response.devices)) return [];
  const devices: MegaInventoryDevice[] = [];
  const seen = new Set<string>();
  for (const value of response.devices) {
    if (!isRecord(value)) continue;
    const serial = safeInventoryValue(value.device_sn, 128);
    if (!serial || seen.has(serial)) continue;
    seen.add(serial);
    const model = safeInventoryValue(value.device_model, 100) ?? "Unknown Eufy device";
    devices.push({
      serial,
      name: safeInventoryValue(value.device_name, 100) ?? model,
      model,
      parentSerial: safeInventoryValue(value.parent_sn, 128) ?? "",
      deviceType: typeof value.device_type === "number" && Number.isSafeInteger(value.device_type) ? value.device_type : null,
      category: safeInventoryValue(value.category, 100),
    });
  }
  return devices;
}

export function mergeInventoryDiagnostics(
  legacy: readonly InventoryDiagnostic[],
  mega: readonly MegaInventoryDevice[],
): InventoryDiagnostic[] {
  const merged = new Map(legacy.map((device) => [device.serial, device]));
  for (const device of mega) {
    const existing = merged.get(device.serial);
    if (existing) {
      merged.set(device.serial, {
        ...existing,
        sources: existing.sources.includes("mega") ? existing.sources : [...existing.sources, "mega"],
        megaDeviceType: device.deviceType,
        category: device.category,
      });
      continue;
    }
    merged.set(device.serial, {
      serial: device.serial,
      name: device.name,
      model: device.model,
      sources: ["mega"],
      upstreamIsCamera: false,
      acceptedAsCamera: isSupportedMegaCamera(device),
      megaDeviceType: device.deviceType,
      category: device.category,
    });
  }
  return [...merged.values()];
}

function isSupportedMegaCamera(device: MegaInventoryDevice): boolean {
  return device.category === "eufy_security" && isSupportedCameraDevice(false, device.model, device.serial);
}

export function isSupportedCameraDevice(upstreamIsCamera: boolean, model: string, serial: string): boolean {
  return upstreamIsCamera || model === "T817L" || serial.startsWith("T817L");
}

export function requiresPushFallback(upstreamIsCamera: boolean, model: string, serial: string): boolean {
  return !upstreamIsCamera && (model === "T817L" || serial.startsWith("T817L"));
}

function isPicture(value: PropertyValue): value is Picture {
  return typeof value === "object" && value !== null && "data" in value && Buffer.isBuffer(value.data);
}

function safeError(error: Error): string {
  return error.message || error.name || "Eufy connection failed";
}

function ensureError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unknown Mega inventory error");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeInventoryValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate && candidate.length <= maxLength ? candidate : null;
}

function safeLabel(value: string | undefined): string | null {
  const name = value?.trim();
  if (!name || name.length > 100) return null;
  return name;
}

export function personNameFromPush(message: Pick<PushMessage, "event_type" | "person_name" | "content">): string | null {
  const structuredName = safeLabel(message.person_name);
  if (structuredName) return isGenericPersonLabel(structuredName) ? null : structuredName;
  if (message.event_type !== 3102 && message.event_type !== 3111) return null;

  const content = message.content?.trim();
  if (!content || content.length > 300) return null;
  const match = /^(?:[^:]{1,100}:\s*)?(.{1,100}?)\s+(?:has been|was)\s+(?:spotted|detected)(?:\b|[.!])/i.exec(content);
  const candidate = safeLabel(match?.[1]);
  return candidate && !isGenericPersonLabel(candidate) ? candidate : null;
}

function isCameraDetection(eventType: number | undefined): boolean {
  return eventType === 3101 || eventType === 3102 || eventType === 3111 || eventType === 3112;
}

function isGenericPersonLabel(value: string): boolean {
  return /^(someone|stranger|unknown|unknown person|person)$/i.test(value);
}
