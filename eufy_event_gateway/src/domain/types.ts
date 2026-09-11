export type ConnectionState =
  | "starting"
  | "connected"
  | "disconnected"
  | "authentication-required"
  | "error";

export type StreamState = "idle" | "starting" | "streaming" | "stopping" | "error";

export interface Detection {
  readonly id: string;
  readonly kind: "motion" | "person";
  readonly occurredAt: string;
  readonly personName: string | null;
  readonly recognized: boolean;
}

export interface SnapshotInfo {
  readonly capturedAt: string;
  readonly contentType: string;
  readonly source: "event" | "live";
  readonly revision: number;
}

export interface CameraState {
  readonly serial: string;
  readonly name: string;
  readonly model: string;
  readonly stationSerial: string;
  readonly streamSupported: boolean;
  readonly motionDetected: boolean;
  readonly personDetected: boolean;
  readonly lastDetection: Detection | null;
  readonly snapshot: SnapshotInfo | null;
  readonly stream: {
    readonly state: StreamState;
    readonly viewers: number;
    readonly startedAt: string | null;
    readonly lastError: string | null;
  };
}

export type GatewayEvent =
  | { readonly type: "camera-updated"; readonly camera: CameraState }
  | { readonly type: "detection"; readonly cameraSerial: string; readonly detection: Detection }
  | { readonly type: "snapshot-updated"; readonly cameraSerial: string; readonly snapshot: SnapshotInfo }
  | { readonly type: "connection-updated"; readonly state: ConnectionState; readonly detail: string | null };

export interface CameraIdentity {
  readonly serial: string;
  readonly name: string;
  readonly model: string;
  readonly stationSerial: string;
  readonly streamSupported: boolean;
}

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

export interface InventoryDiagnostic {
  readonly serial: string;
  readonly name: string;
  readonly model: string;
  readonly sources: readonly ("legacy" | "mega")[];
  readonly upstreamIsCamera: boolean;
  readonly acceptedAsCamera: boolean;
  readonly megaDeviceType: number | null;
  readonly category: string | null;
}
