/**
 * Defines the gateway's protocol-neutral state and event contract.
 *
 * The provider converts untrusted Mega, Firebase, and PPCS observations into
 * these values. `GatewayState`, `GatewayServer`, and the Python Home Assistant
 * client consume them. No field in this file should require a caller to know
 * a Mega endpoint, packet header, encryption key, or Eufy-specific payload
 * shape; changing such a field means changing the public gateway API.
 */

/** Connection states reported by the provider and health endpoint. */
export type ConnectionState =
  | "starting"
  | "connected"
  | "disconnected"
  | "authentication-required"
  | "error";

/** Lifecycle states for a camera's shared media source. */
export type StreamState = "idle" | "starting" | "streaming" | "stopping" | "error";

/** One normalized motion, person, or doorbell event emitted by the gateway. */
export interface Detection {
  readonly id: string;
  readonly kind: "motion" | "person" | "doorbell";
  readonly occurredAt: string;
  readonly personName: string | null;
  readonly recognized: boolean;
}

/** Metadata for the last retained image for a camera. */
export interface SnapshotInfo {
  readonly capturedAt: string;
  readonly contentType: string;
  readonly source: "event" | "live";
  readonly revision: number;
}

/** Complete state returned for one camera by the HTTP API. */
export interface CameraState {
  readonly serial: string;
  readonly name: string;
  readonly model: string;
  readonly stationSerial: string;
  readonly streamSupported: boolean;
  readonly doorbellSupported: boolean;
  readonly motionDetected: boolean;
  readonly personDetected: boolean;
  readonly doorbellPressed: boolean;
  readonly lastDetection: Detection | null;
  readonly snapshot: SnapshotInfo | null;
  readonly stream: {
    readonly state: StreamState;
    readonly viewers: number;
    readonly startedAt: string | null;
    readonly lastError: string | null;
  };
}

/** One physical storage device reported by a HomeBase 3. */
export interface HomeBaseStorageState {
  readonly status: string | null;
  readonly totalBytes: number | null;
  readonly freeBytes: number | null;
}

/** Complete normalized state for one HomeBase 3. */
export interface HomeBaseState {
  readonly serial: string;
  readonly name: string;
  readonly model: string;
  readonly firmware: string | null;
  readonly available: boolean;
  readonly connected: boolean;
  readonly guardMode: number | null;
  readonly effectiveMode: number | null;
  readonly alarmActive: boolean | null;
  readonly alarmVolume: number | null;
  readonly promptVolume: number | null;
  readonly alarmTone: number | null;
  readonly storage: {
    readonly emmc: HomeBaseStorageState | null;
    readonly hdd: HomeBaseStorageState | null;
  };
}

/** Events sent over the gateway SSE endpoint. */
export type GatewayEvent =
  | { readonly type: "camera-updated"; readonly camera: CameraState }
  | { readonly type: "station-updated"; readonly station: HomeBaseState }
  | { readonly type: "stations-updated"; readonly stations: readonly HomeBaseState[] }
  | { readonly type: "detection"; readonly cameraSerial: string; readonly detection: Detection }
  | { readonly type: "snapshot-updated"; readonly cameraSerial: string; readonly snapshot: SnapshotInfo }
  | { readonly type: "connection-updated"; readonly state: ConnectionState; readonly detail: string | null };

/** Stable camera metadata discovered from Mega inventory. */
export interface CameraIdentity {
  readonly serial: string;
  readonly name: string;
  readonly model: string;
  readonly stationSerial: string;
  readonly streamSupported: boolean;
  readonly doorbellSupported: boolean;
}

/** Stable metadata for a HomeBase 3 discovered through Mega inventory. */
export interface HomeBaseIdentity {
  readonly serial: string;
  readonly name: string;
  readonly model: string;
  readonly firmware: string | null;
}

/** Safe, field-level evidence about a push message, with payloads omitted. */
export interface PushDiagnostic {
  readonly receivedAt: string;
  readonly cameraSerial: string;
  readonly cameraName: string | null;
  readonly type: number | null;
  readonly eventType: number | null;
  readonly messageType: number | null;
  readonly notificationStyle: number | null;
  readonly personName: string | null;
  readonly hasPersonName: boolean;
  readonly hasPictureUrl: boolean;
  readonly hasFilePath: boolean;
  readonly hasFetchId: boolean;
  readonly hasSenseId: boolean;
}

/** Explains why an upstream device was accepted or rejected as a camera. */
export interface InventoryDiagnostic {
  readonly serial: string;
  readonly name: string;
  readonly model: string;
  readonly sources: readonly ("mega" | "simulated")[];
  readonly upstreamIsCamera: boolean;
  readonly acceptedAsCamera: boolean;
  readonly megaDeviceType: number | null;
  readonly category: string | null;
}
