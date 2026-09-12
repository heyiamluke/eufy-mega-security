/** In-memory state and lifecycle events exposed by the gateway API. */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import type {
  CameraIdentity,
  CameraState,
  ConnectionState,
  Detection,
  GatewayEvent,
  SnapshotInfo,
  StreamState,
  PushDiagnostic,
  InventoryDiagnostic,
} from "./types.js";

interface MutableCameraState {
  identity: CameraIdentity;
  motionDetected: boolean;
  personDetected: boolean;
  lastDetection: Detection | null;
  snapshot: SnapshotInfo | null;
  streamState: StreamState;
  streamViewers: number;
  streamStartedAt: string | null;
  streamLastError: string | null;
}

export class GatewayState extends EventEmitter {
  readonly #cameras = new Map<string, MutableCameraState>();
  readonly #pushDiagnostics: PushDiagnostic[] = [];
  readonly #motionClearTimers = new Map<string, NodeJS.Timeout>();
  readonly #personClearTimers = new Map<string, NodeJS.Timeout>();
  #inventoryDiagnostics: InventoryDiagnostic[] = [];
  #connectionState: ConnectionState = "starting";
  #connectionDetail: string | null = null;

  constructor(private readonly detectionHoldMilliseconds = 10_000) {
    super();
  }

  registerCamera(identity: CameraIdentity): CameraState {
    const existing = this.#cameras.get(identity.serial);
    if (existing) {
      existing.identity = identity;
    } else {
      this.#cameras.set(identity.serial, {
        identity,
        motionDetected: false,
        personDetected: false,
        lastDetection: null,
        snapshot: null,
        streamState: "idle",
        streamViewers: 0,
        streamStartedAt: null,
        streamLastError: null,
      });
    }
    return this.#emitCamera(identity.serial);
  }

  restoreSnapshot(serial: string, snapshot: SnapshotInfo): void {
    const camera = this.#requireCamera(serial);
    camera.snapshot = snapshot;
    this.#emitCamera(serial);
  }

  recordMotion(serial: string, detected: boolean, occurredAt = new Date()): void {
    const camera = this.#requireCamera(serial);
    camera.motionDetected = detected;
    this.#scheduleDetectionClear(this.#motionClearTimers, serial, detected, () => this.recordMotion(serial, false));
    if (detected) {
      const detection: Detection = {
        id: randomUUID(),
        kind: "motion",
        occurredAt: occurredAt.toISOString(),
        personName: null,
        recognized: false,
      };
      if (!isRecentPersonDetection(camera.lastDetection, occurredAt)) camera.lastDetection = detection;
      this.emit("event", { type: "detection", cameraSerial: serial, detection } satisfies GatewayEvent);
    }
    this.#emitCamera(serial);
  }

  recordPerson(serial: string, detected: boolean, personName: string | null, occurredAt = new Date()): void {
    const camera = this.#requireCamera(serial);
    camera.personDetected = detected;
    this.#scheduleDetectionClear(this.#personClearTimers, serial, detected, () => this.recordPerson(serial, false, null));
    if (detected) {
      const normalizedName = normalizePersonName(personName);
      const detection: Detection = {
        id: randomUUID(),
        kind: "person",
        occurredAt: occurredAt.toISOString(),
        personName: normalizedName,
        recognized: normalizedName !== null,
      };
      camera.lastDetection = detection;
      this.emit("event", { type: "detection", cameraSerial: serial, detection } satisfies GatewayEvent);
    }
    this.#emitCamera(serial);
  }

  updateSnapshot(serial: string, snapshot: SnapshotInfo): void {
    const camera = this.#requireCamera(serial);
    camera.snapshot = snapshot;
    this.emit("event", { type: "snapshot-updated", cameraSerial: serial, snapshot } satisfies GatewayEvent);
    this.#emitCamera(serial);
  }

  updateStream(serial: string, state: StreamState, viewers: number, error: string | null = null): void {
    const camera = this.#requireCamera(serial);
    camera.streamState = state;
    camera.streamViewers = viewers;
    camera.streamLastError = error;
    if (state === "streaming" && camera.streamStartedAt === null) {
      camera.streamStartedAt = new Date().toISOString();
    } else if (state === "idle" || state === "error") {
      camera.streamStartedAt = null;
    }
    this.#emitCamera(serial);
  }

  updateConnection(state: ConnectionState, detail: string | null = null): void {
    this.#connectionState = state;
    this.#connectionDetail = detail;
    this.emit("event", { type: "connection-updated", state, detail } satisfies GatewayEvent);
  }

  getConnection(): { state: ConnectionState; detail: string | null } {
    return { state: this.#connectionState, detail: this.#connectionDetail };
  }

  recordPushDiagnostic(diagnostic: PushDiagnostic): void {
    this.#pushDiagnostics.push(diagnostic);
    if (this.#pushDiagnostics.length > 50) this.#pushDiagnostics.shift();
  }

  listPushDiagnostics(): PushDiagnostic[] {
    return [...this.#pushDiagnostics];
  }

  updateInventoryDiagnostics(diagnostics: InventoryDiagnostic[]): void {
    this.#inventoryDiagnostics = [...diagnostics];
  }

  listInventoryDiagnostics(): InventoryDiagnostic[] {
    return [...this.#inventoryDiagnostics];
  }

  listCameras(): CameraState[] {
    return [...this.#cameras.keys()].map((serial) => this.getCamera(serial));
  }

  getCamera(serial: string): CameraState {
    const camera = this.#requireCamera(serial);
    return {
      serial: camera.identity.serial,
      name: camera.identity.name,
      model: camera.identity.model,
      stationSerial: camera.identity.stationSerial,
      streamSupported: camera.identity.streamSupported,
      motionDetected: camera.motionDetected,
      personDetected: camera.personDetected,
      lastDetection: camera.lastDetection,
      snapshot: camera.snapshot,
      stream: {
        state: camera.streamState,
        viewers: camera.streamViewers,
        startedAt: camera.streamStartedAt,
        lastError: camera.streamLastError,
      },
    };
  }

  hasCamera(serial: string): boolean {
    return this.#cameras.has(serial);
  }

  close(): void {
    for (const timer of this.#motionClearTimers.values()) clearTimeout(timer);
    for (const timer of this.#personClearTimers.values()) clearTimeout(timer);
    this.#motionClearTimers.clear();
    this.#personClearTimers.clear();
  }

  #scheduleDetectionClear(
    timers: Map<string, NodeJS.Timeout>,
    serial: string,
    detected: boolean,
    clear: () => void,
  ): void {
    const existing = timers.get(serial);
    if (existing) clearTimeout(existing);
    timers.delete(serial);
    if (!detected) return;

    const timer = setTimeout(() => {
      timers.delete(serial);
      clear();
    }, this.detectionHoldMilliseconds);
    timer.unref();
    timers.set(serial, timer);
  }

  #requireCamera(serial: string): MutableCameraState {
    const camera = this.#cameras.get(serial);
    if (!camera) throw new Error(`Unknown camera: ${serial}`);
    return camera;
  }

  #emitCamera(serial: string): CameraState {
    const camera = this.getCamera(serial);
    this.emit("event", { type: "camera-updated", camera } satisfies GatewayEvent);
    return camera;
  }
}

function isRecentPersonDetection(detection: Detection | null, occurredAt: Date): boolean {
  if (detection?.kind !== "person") return false;
  const ageMilliseconds = occurredAt.getTime() - new Date(detection.occurredAt).getTime();
  return ageMilliseconds >= 0 && ageMilliseconds <= 10_000;
}

export function normalizePersonName(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || /^(unknown|unknown person|no person)$/i.test(candidate)) return null;
  return candidate;
}
