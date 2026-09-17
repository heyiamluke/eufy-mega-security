/**
 * Exercises media lifecycle policy above a fake provider byte stream.
 *
 * The cases cover one shared source for multiple consumers, fresh JPEG capture,
 * bounded MP4 recording, idle grace cleanup, and failure propagation without
 * opening a real PPCS socket.
 */
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import test from "node:test";

import { GatewayState } from "../src/domain/gateway-state.js";
import { H264ParameterSetCache, LiveStreamManager } from "../src/stream/live-stream-manager.js";

const camera = {
  serial: "camera-1",
  name: "Doorbell",
  model: "T8210",
  stationSerial: "homebase-1",
  streamSupported: true,
  doorbellSupported: true,
};

function annexBNal(type: number, ...body: number[]): Buffer {
  return Buffer.from([0, 0, 0, 1, type, ...body]);
}

test("retains SPS and PPS split across arbitrary source chunks", () => {
  const cache = new H264ParameterSetCache();
  const sps = annexBNal(0x67, 0x42, 0x00, 0x1f);
  const pps = annexBNal(0x68, 0xce, 0x06);
  const idr = annexBNal(0x65, 0x88);
  const stream = Buffer.concat([sps, pps, idr]);

  cache.push(stream.subarray(0, sps.length + 2));
  assert.equal(cache.bootstrap, null);
  cache.push(stream.subarray(sps.length + 2));

  assert.deepEqual(cache.bootstrap, Buffer.concat([sps, pps]));
});

test("bootstraps first and repeat HTTP viewers with SPS and PPS", async () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  let manager: LiveStreamManager;
  let source: PassThrough;
  manager = new LiveStreamManager(
    state,
    {} as never,
    {
      async startStream() {
        source = new PassThrough();
        manager.attachSource(camera.serial, source);
      },
      async stopStream() {
        source.end();
      },
    },
    5,
  );

  const response = new PassThrough() as unknown as ServerResponse;
  response.writeHead = (() => response) as ServerResponse["writeHead"];
  const firstBytes: Buffer[] = [];
  response.on("data", (chunk: Buffer) => firstBytes.push(Buffer.from(chunk)));
  await manager.addClient(camera.serial, response);

  source!.write(annexBNal(0x41, 1, 2, 3));
  assert.equal(firstBytes.length, 0);
  const sps = annexBNal(0x67, 0x42, 0x00, 0x1f);
  const pps = annexBNal(0x68, 0xce, 0x06);
  source!.write(Buffer.concat([sps, pps, annexBNal(0x65, 4, 5)]));
  assert.deepEqual(Buffer.concat(firstBytes).subarray(0, sps.length + pps.length), Buffer.concat([sps, pps]));

  const repeatResponse = new PassThrough() as unknown as ServerResponse;
  let repeatHeadersWritten = false;
  repeatResponse.writeHead = (() => {
    repeatHeadersWritten = true;
    return repeatResponse;
  }) as ServerResponse["writeHead"];
  const repeatWrite = repeatResponse.write.bind(repeatResponse);
  repeatResponse.write = ((chunk: Buffer) => {
    assert.equal(repeatHeadersWritten, true, "codec bootstrap must follow HTTP headers");
    return repeatWrite(chunk);
  }) as ServerResponse["write"];
  const repeatBytes: Buffer[] = [];
  repeatResponse.on("data", (chunk: Buffer) => repeatBytes.push(Buffer.from(chunk)));
  await manager.addClient(camera.serial, repeatResponse);

  assert.deepEqual(Buffer.concat(repeatBytes), Buffer.concat([sps, pps]));
  await manager.close();
});

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

test("reports a frame timeout without an unhandled rejection during slow stream startup", async () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  const manager = new LiveStreamManager(
    state,
    {} as never,
    {
      async startStream() {
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
      async stopStream() {},
    },
    5,
  );

  await assert.rejects(manager.captureSnapshot(camera.serial, 5), /Timed out waiting for a fresh camera frame/);
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

test("reports a video timeout without an unhandled rejection during slow stream startup", async () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  const manager = new LiveStreamManager(
    state,
    {} as never,
    {
      async startStream() {
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
      async stopStream() {},
    },
    5,
    async (h264) => h264,
  );

  await assert.rejects(manager.recordClip(camera.serial, 1, 5), /Timed out waiting for camera video/);
  await manager.close();
});
