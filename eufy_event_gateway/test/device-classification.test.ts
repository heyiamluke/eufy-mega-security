import assert from "node:assert/strict";
import test from "node:test";

import { isSupportedCameraDevice, requiresPushFallback } from "../src/provider/eufy-provider.js";

test("recognizes upstream cameras and the not-yet-classified Wired Cam C31", () => {
  assert.equal(isSupportedCameraDevice(true, "T8113-Z", "T8113N123"), true);
  assert.equal(isSupportedCameraDevice(false, "T817L", "T817LT123"), true);
  assert.equal(isSupportedCameraDevice(false, "unknown", "T817LT123"), true);
  assert.equal(isSupportedCameraDevice(false, "T8920", "T8920P123"), false);
});

test("keeps direct push handling for a C31 the legacy client exposes only as a generic device", () => {
  assert.equal(requiresPushFallback(false, "T817L", "T817LT123"), true);
  assert.equal(requiresPushFallback(true, "T8113-Z", "T8113N123"), false);
});
