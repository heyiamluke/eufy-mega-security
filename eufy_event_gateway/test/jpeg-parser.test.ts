import assert from "node:assert/strict";
import test from "node:test";

import { JpegParser } from "../src/stream/jpeg-parser.js";

test("extracts complete JPEG images across arbitrary chunks", () => {
  const parser = new JpegParser();
  const first = Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]);
  const second = Buffer.from([0xff, 0xd8, 3, 4, 0xff, 0xd9]);

  assert.deepEqual(parser.push(Buffer.concat([Buffer.from([9]), first.subarray(0, 3)])), []);
  assert.deepEqual(parser.push(Buffer.concat([first.subarray(3), second])), [first, second]);
});
