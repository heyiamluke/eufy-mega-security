/**
 * Exercises media lifecycle policy above a fake provider byte stream.
 *
 * The cases cover one shared source for multiple consumers, fresh JPEG capture,
 * bounded MP4 recording, idle grace cleanup, and failure propagation without
 * opening a real PPCS socket.
 */
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { GatewayState } from "../src/domain/gateway-state.js";
import { LiveStreamManager } from "../src/stream/live-stream-manager.js";

const camera = {
  serial: "camera-1",
  name: "Doorbell",
  model: "T8210",
  stationSerial: "homebase-1",
  streamSupported: true,
  doorbellSupported: true,
};

test("holds an on-demand stream until a fresh snapshot arrives", async () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  let starts = 0;
  let stops = 0;
  const manager = new LiveStreamManager(
    state,
    {} as never,
    {
      async startStream() {
        starts += 1;
        setTimeout(() => state.updateSnapshot(camera.serial, {
          capturedAt: new Date().toISOString(),
          contentType: "image/jpeg",
          source: "live",
          revision: 1,
        }), 5);
      },
      async stopStream() {
        stops += 1;
      },
    },
    5,
  );

  const snapshot = await manager.captureSnapshot(camera.serial, 50);
  assert.equal(snapshot.revision, 1);
  assert.equal(starts, 1);

  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(stops, 1);
  await manager.close();
});

test("releases its state listener after a capture timeout", async () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  const manager = new LiveStreamManager(
    state,
    {} as never,
    { async startStream() {}, async stopStream() {} },
    5,
  );

  await assert.rejects(manager.captureSnapshot(camera.serial, 5), /Timed out/);
  assert.equal(state.listenerCount("event"), 0);
  await manager.close();
});

test("cancels a pending snapshot promptly when the gateway closes", async () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  const manager = new LiveStreamManager(
    state,
    {} as never,
    { async startStream() {}, async stopStream() {} },
    5,
  );

  const capture = manager.captureSnapshot(camera.serial, 60_000);
  const rejected = assert.rejects(capture, /Gateway closed/);
  await new Promise((resolve) => setImmediate(resolve));
  await manager.close();
  await rejected;
  assert.equal(state.listenerCount("event"), 0);
});

test("releases a startup snapshot source before the next camera is warmed", async () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  let manager: LiveStreamManager;
  let stops = 0;
  manager = new LiveStreamManager(
    state,
    {} as never,
    {
      async startStream() {
        manager.attachSource(camera.serial, new PassThrough());
        setTimeout(() => state.updateSnapshot(camera.serial, {
          capturedAt: new Date().toISOString(),
          contentType: "image/jpeg",
          source: "live",
          revision: 1,
        }), 5);
      },
      async stopStream() {
        stops += 1;
        manager.markStopped(camera.serial);
      },
    },
    1_000,
  );

  const snapshot = await manager.captureStartupSnapshot(camera.serial, 50);
  assert.equal(snapshot.revision, 1);
  assert.equal(stops, 1);
  assert.equal(state.getCamera(camera.serial).stream.state, "idle");
  await manager.close();
});

test("records for a bounded duration and releases the on-demand stream", async () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  let manager: LiveStreamManager;
  let source: PassThrough;
  let writes: NodeJS.Timeout;
  let stops = 0;
  manager = new LiveStreamManager(
    state,
    {} as never,
    {
      async startStream() {
        source = new PassThrough();
        manager.attachSource(camera.serial, source);
        source.write(Buffer.from("h264"));
        writes = setInterval(() => source.write(Buffer.from("h264")), 10);
      },
      async stopStream() {
        stops += 1;
        source.end();
      },
    },
    5,
    async (h264) => Buffer.concat([Buffer.from("mp4:"), h264]),
  );

  const clip = await manager.recordClip(camera.serial, 1, 50);
  clearInterval(writes!);
  assert.match(clip.toString(), /^mp4:h264/);

  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(stops, 1);
  await manager.close();
});

test("rejects a recording when camera video never arrives", async () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  const manager = new LiveStreamManager(
    state,
    {} as never,
    { async startStream() {}, async stopStream() {} },
    5,
    async (h264) => h264,
  );

  await assert.rejects(manager.recordClip(camera.serial, 1, 5), /Timed out waiting for camera video/);
  await manager.close();
});
