/**
 * Covers the structural boundary between Eufy's wrapped event thumbnails and
 * the reconstructed JPEG passed to Home Assistant's snapshot store.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { decodeEventImage } from "../src/mega/image.js";

test("reconstructs a complete chroma quantization table before the frame header", () => {
  const wrapper = Buffer.concat([
    Buffer.from("v2_eufysecurity:camera:event:"),
    Buffer.from([0xff, 0xc4, 0x00, 0x1f, 0x01, 0xff, 0xd9]),
  ]);
  const jpeg = decodeEventImage(wrapper);
  const firstTable = jpeg.indexOf(Buffer.from([0xff, 0xdb]));
  const secondTable = jpeg.indexOf(Buffer.from([0xff, 0xdb]), firstTable + 2);
  const nextMarker = secondTable + 2 + jpeg.readUInt16BE(secondTable + 2);

  assert.deepEqual(jpeg.subarray(nextMarker, nextMarker + 2), Buffer.from([0xff, 0xc0]));
});
