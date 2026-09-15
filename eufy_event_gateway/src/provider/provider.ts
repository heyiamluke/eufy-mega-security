/**
 * Defines the narrow adapter boundary between a camera provider and the
 * protocol-neutral gateway.
 *
 * Implementations own authentication, inventory, push decoding, image
 * retrieval, and stream startup. They report normalized facts through these
 * callbacks, while `GatewayState` and `GatewayServer` own presentation and
 * lifecycle policy. The simulated provider implements the same contract for
 * tests; the production provider is the only implementation allowed to know
 * Mega and PPCS details.
 */
import type { Readable } from "node:stream";

import type { CameraIdentity, HomeBaseState, InventoryDiagnostic, PushDiagnostic } from "../domain/types.js";

/** Callbacks through which a provider reports normalized observations. */
export interface ProviderEvents {
  camera(identity: CameraIdentity): void;
  station(state: HomeBaseState): void;
  connection(state: "connected" | "disconnected" | "authentication-required" | "error", detail: string | null): void;
  motion(serial: string, detected: boolean): void;
  person(serial: string, detected: boolean, personName: string | null): void;
  doorbell(serial: string, pressed: boolean): void;
  snapshot(serial: string, data: Buffer, contentType: string): void;
  pushDiagnostic(diagnostic: PushDiagnostic): void;
  inventory(diagnostics: InventoryDiagnostic[]): void;
  streamStarted(serial: string, video: Readable): void;
  streamStopped(serial: string): void;
}

/** Lifecycle and stream operations required by the gateway server. */
export interface CameraProvider {
  start(events: ProviderEvents): Promise<void>;
  startStream(serial: string): Promise<void>;
  stopStream(serial: string): Promise<void>;
  refreshStation(serial: string): Promise<HomeBaseState>;
  setGuardMode(serial: string, mode: number): Promise<HomeBaseState>;
  setAlarmVolume(serial: string, value: number): Promise<HomeBaseState>;
  setPromptVolume(serial: string, value: number): Promise<HomeBaseState>;
  setAlarmTone(serial: string, value: number): Promise<HomeBaseState>;
  close(): Promise<void>;
}

/** Image challenge that the local authentication page can display. */
export interface CaptchaChallenge {
  readonly id: string;
  readonly image: string;
}

/** Optional authentication challenge operations exposed by a provider. */
export interface CaptchaProvider {
  getCaptchaChallenge(): CaptchaChallenge | null;
  isVerificationRequired(): boolean;
  submitCaptcha(answer: string): Promise<void>;
  submitVerification(code: string): Promise<void>;
}
