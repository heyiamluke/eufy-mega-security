/**
 * Verifies attached-camera media restart boundaries for the PPCS transport.
 *
 * The session owns the UDP protocol; this test guards the time-based policy
 * that prevents a healthy HomeBase stream being reset by its own heartbeat.
 */
import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import test from "node:test";

import {
  acceptsAttachedCameraMedia,
  decodePpcsVideoFrame,
  needsAttachedMediaReassert,
  normalizePpcsVideoPayload,
  ppcsFrameChannel,
  ppcsSequenceDisposition,
} from "../src/stream/first-party-ppcs.js";

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

  assert.deepEqual(
    normalizePpcsVideoPayload(lengthPrefixed),
    Buffer.concat([Buffer.from([0, 0, 0, 1]), sei, Buffer.from([0, 0, 0, 1]), idr]),
  );
});

test("leaves Annex-B and incomplete length-prefixed payloads unchanged", () => {
  const annexB = Buffer.from([0, 0, 0, 1, 0x65, 0x88]);
  const incomplete = Buffer.from([0, 0, 0, 0x3f, 0x06, 0x05, 0x3a, 0xfe]);

  assert.equal(normalizePpcsVideoPayload(annexB), annexB);
  assert.equal(normalizePpcsVideoPayload(incomplete), incomplete);
});
