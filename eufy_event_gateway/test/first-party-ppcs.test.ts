/**
 * Verifies attached-camera media restart boundaries for the PPCS transport.
 *
 * The session owns the UDP protocol; this test guards the time-based policy
 * that prevents a healthy HomeBase stream being reset by its own heartbeat.
 */
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv } from "node:crypto";
import test from "node:test";

import {
  acceptsAttachedCameraMedia,
  buildStandaloneLiveStartPayload,
  decodePpcsVideoFrame,
  needsAttachedMediaReassert,
  PpcsVideoStreamNormalizer,
  ppcsFrameChannel,
  ppcsSequenceDisposition,
} from "../src/stream/first-party-ppcs.js";

test("labels a standalone live start as level-one frame type 11", () => {
  const key = Buffer.from("0123456789abcdef", "utf8");
  const value = JSON.stringify({ commandType: 1000, data: { cmd: 1000 } });
  const payload = buildStandaloneLiveStartPayload(value, 4, key);

  assert.equal(payload.readUInt16LE(0), payload.length - 10);
  assert.deepEqual(payload.subarray(4, 10), Buffer.from([1, 0, 4, 1, 11, 0]));

  const decipher = createDecipheriv("aes-128-ecb", key, null);
  decipher.setAutoPadding(false);
  const clear = Buffer.concat([decipher.update(payload.subarray(10)), decipher.final()]);
  assert.equal(clear.subarray(0, value.length).toString("utf8"), value);
});

test("reasserts attached media only until a frame arrives or after a stall", () => {
  assert.equal(needsAttachedMediaReassert(null, 1_000), true);
  assert.equal(needsAttachedMediaReassert(1_000, 6_000), false);
  assert.equal(needsAttachedMediaReassert(1_000, 11_000), true);
});

test("accepts only the requested camera's HomeBase video", () => {
  assert.equal(acceptsAttachedCameraMedia(1300, 4, 4), true);
  assert.equal(acceptsAttachedCameraMedia(1300, 3, 4), false);
  assert.equal(acceptsAttachedCameraMedia(1100, 3, 4), true);
});

test("reads the media channel from the current frame before the parser advances", () => {
  const currentFrame = Buffer.alloc(16);
  Buffer.from("XZYH").copy(currentFrame);
  currentFrame[12] = 4;
  const followingFrame = Buffer.alloc(16, 9);

  assert.equal(ppcsFrameChannel(Buffer.concat([currentFrame, followingFrame])), 4);
  assert.equal(ppcsFrameChannel(followingFrame), null);
});

test("distinguishes forward loss from duplicate and stale PPCS datagrams", () => {
  assert.equal(ppcsSequenceDisposition(null, 12), "first");
  assert.equal(ppcsSequenceDisposition(12, 13), "next");
  assert.equal(ppcsSequenceDisposition(12, 15), "gap");
  assert.equal(ppcsSequenceDisposition(12, 12), "duplicate");
  assert.equal(ppcsSequenceDisposition(12, 11), "stale");
  assert.equal(ppcsSequenceDisposition(5_000, 1), "restart");
  assert.equal(ppcsSequenceDisposition(0xffff, 0), "next");
});

test("does not apply an earlier encrypted frame key to a plaintext frame", () => {
  const annexB = Buffer.from([0, 0, 0, 1, 0x65, 0x88]);
  const frame = Buffer.alloc(22 + annexB.length);
  frame.writeUInt32LE(annexB.length, 0);
  annexB.copy(frame, 22);

  assert.deepEqual(decodePpcsVideoFrame(frame, 0, () => Buffer.alloc(16, 9)), annexB);
});

test("unwraps and uses the key carried by an encrypted video frame", () => {
  const key = Buffer.alloc(16, 7);
  const clear = Buffer.concat([Buffer.from([0, 0, 0, 1, 0x65]), Buffer.alloc(123, 3)]);
  const cipher = createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
  const tail = Buffer.from([4, 5, 6]);
  const frame = Buffer.alloc(151 + clear.length + tail.length);
  frame.writeUInt32LE(clear.length + tail.length, 0);
  Buffer.alloc(128, 8).copy(frame, 22);
  encrypted.copy(frame, 151);
  tail.copy(frame, 151 + encrypted.length);

  assert.deepEqual(decodePpcsVideoFrame(frame, 1, () => key), Buffer.concat([clear, tail]));
});

test("converts complete length-prefixed H.264 NAL units to Annex-B", () => {
  const sei = Buffer.from([0x06, 0x05, 0x3a, 0xfe]);
  const idr = Buffer.from([0x65, 0x88, 0x84]);
  const lengthPrefixed = Buffer.alloc(8 + sei.length + idr.length);
  lengthPrefixed.writeUInt32BE(sei.length, 0);
  sei.copy(lengthPrefixed, 4);
  lengthPrefixed.writeUInt32BE(idr.length, 4 + sei.length);
  idr.copy(lengthPrefixed, 8 + sei.length);

  const normalizer = new PpcsVideoStreamNormalizer();
  assert.deepEqual(
    normalizer.push(lengthPrefixed),
    Buffer.concat([Buffer.from([0, 0, 0, 1]), sei, Buffer.from([0, 0, 0, 1]), idr]),
  );
  assert.equal(normalizer.framing, "length-prefixed");
});

test("leaves an Annex-B stream unchanged", () => {
  const annexB = Buffer.from([0, 0, 0, 1, 0x65, 0x88]);
  const normalizer = new PpcsVideoStreamNormalizer();

  assert.equal(normalizer.push(annexB), annexB);
  assert.equal(normalizer.framing, "annexb");
});

test("converts a length-prefixed NAL split across PPCS video frames", () => {
  const normalizer = new PpcsVideoStreamNormalizer();
  const first = Buffer.from([0, 0, 0, 0xfc, 0x21, 0xe6, 0x03, 0x04]);
  const second = Buffer.alloc(248, 0x55);

  assert.deepEqual(
    normalizer.push(first),
    Buffer.from([0, 0, 0, 1, 0x21, 0xe6, 0x03, 0x04]),
  );
  assert.deepEqual(normalizer.push(second), second);
  assert.equal(normalizer.framing, "length-prefixed");
});

test("retains a split length prefix until the next PPCS video frame", () => {
  const normalizer = new PpcsVideoStreamNormalizer();

  assert.deepEqual(normalizer.push(Buffer.from([0, 0])), Buffer.alloc(0));
  assert.deepEqual(
    normalizer.push(Buffer.from([0, 3, 0x65, 0x88, 0x84])),
    Buffer.from([0, 0, 0, 1, 0x65, 0x88, 0x84]),
  );
});
