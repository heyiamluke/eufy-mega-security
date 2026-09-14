/**
 * Provides a deterministic implementation of the provider boundary.
 *
 * The simulated provider owns no cloud credentials and performs no Eufy
 * network calls. It creates a known camera, emits repeatable JPEG/H.264 test
 * bytes, and can trigger detection events through the development endpoint.
 * This keeps HTTP, SSE, snapshot, and Home Assistant integration work
 * reproducible when Mega is unavailable or a physical camera is asleep.
 */
import { Readable } from "node:stream";

import type { CameraProvider, ProviderEvents } from "./provider.js";

/**
 * Supplies deterministic camera observations for tests and local API checks.
 * It follows the same callback contract as EufyProvider, so the server and
 * state layers can be exercised without changing their production code.
 */
export class SimulatedProvider implements CameraProvider {
  static readonly serial = "SIMULATED-CAMERA-1";
  #events: ProviderEvents | null = null;

  async start(events: ProviderEvents): Promise<void> {
    this.#events = events;
    events.camera({
      serial: SimulatedProvider.serial,
      name: "Simulated driveway",
      model: "T8142-compatible simulator",
      stationSerial: "SIMULATED-HOMEBASE-3",
      streamSupported: true,
    });
    events.inventory([{
      serial: SimulatedProvider.serial,
      name: "Simulated driveway",
      model: "T8142-compatible simulator",
      sources: ["simulated"],
      upstreamIsCamera: true,
      acceptedAsCamera: true,
      megaDeviceType: null,
      category: null,
    }]);
    events.connection("connected", "simulated provider");
  }

  async startStream(serial: string): Promise<void> {
    this.#assertSerial(serial);
    this.#events?.streamStarted(serial, Readable.from([]));
  }

  async stopStream(serial: string): Promise<void> {
    this.#assertSerial(serial);
    this.#events?.streamStopped(serial);
  }

  async close(): Promise<void> {
    this.#events?.connection("disconnected", "simulated provider stopped");
    this.#events = null;
  }

  detectMotion(personName: string | null = null): void {
    const events = this.#events;
    if (!events) return;
    events.pushDiagnostic({
      receivedAt: new Date().toISOString(),
      cameraSerial: SimulatedProvider.serial,
      cameraName: "Simulated driveway",
      type: 1,
      eventType: personName === null ? 1 : 2,
      messageType: 3,
      notificationStyle: 1,
      personName,
      hasPersonName: personName !== null,
      hasPictureUrl: true,
      hasFilePath: false,
      hasFetchId: personName !== null,
      hasSenseId: false,
    });
    events.motion(SimulatedProvider.serial, true);
    if (personName !== null) events.person(SimulatedProvider.serial, true, personName);
  }

  #assertSerial(serial: string): void {
    if (serial !== SimulatedProvider.serial) throw new Error(`Unknown simulated camera: ${serial}`);
  }
}
