/**
 * Protects first-image warm-up independently of Eufy and FFmpeg.
 *
 * These cases verify startup gating, one-at-a-time capture, retained-image
 * rechecks, failure isolation, and shutdown without opening camera sessions.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { StartupSnapshotWarmup } from "../src/startup-snapshot-warmup.js";

test("captures new cameras sequentially after provider startup", async () => {
  const captures: string[] = [];
  let releaseFirst!: () => void;
  const firstCapture = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const warmup = new StartupSnapshotWarmup(
    () => false,
    async (serial) => {
      captures.push(serial);
      if (serial === "camera-1") await firstCapture;
    },
    () => assert.fail("No warm-up capture should fail"),
  );

  warmup.enqueue("camera-1");
  warmup.enqueue("camera-2");
  assert.deepEqual(captures, []);
  warmup.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(captures, ["camera-1"]);

  releaseFirst();
  await warmup.waitUntilIdle();
  assert.deepEqual(captures, ["camera-1", "camera-2"]);
});

test("skips retained images and continues after a camera capture fails", async () => {
  const captures: string[] = [];
  const failures: unknown[] = [];
  const retained = new Set(["camera-2"]);
  const warmup = new StartupSnapshotWarmup(
    (serial) => retained.has(serial),
    async (serial) => {
      captures.push(serial);
      if (serial === "camera-1") throw new Error("camera sleeping");
    },
    (error) => failures.push(error),
  );

  warmup.enqueue("camera-1");
  warmup.enqueue("camera-2");
  warmup.enqueue("camera-3");
  warmup.start();
  await warmup.waitUntilIdle();

  assert.deepEqual(captures, ["camera-1", "camera-3"]);
  assert.equal(failures.length, 1);
});

test("does not start queued captures after shutdown", async () => {
  const captures: string[] = [];
  const warmup = new StartupSnapshotWarmup(
    () => false,
    async (serial) => {
      captures.push(serial);
    },
    () => assert.fail("No warm-up capture should fail"),
  );

  warmup.enqueue("camera-1");
  warmup.stop();
  warmup.start();
  await warmup.waitUntilIdle();
  assert.deepEqual(captures, []);
});
