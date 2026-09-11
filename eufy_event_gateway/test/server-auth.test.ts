import assert from "node:assert/strict";
import test from "node:test";

import { createStreamToken, isBearerAuthorized, validateStreamToken } from "../src/server.js";

test("compares bearer credentials without accepting malformed values", () => {
  assert.equal(isBearerAuthorized("Bearer long-random-token", "long-random-token"), true);
  assert.equal(isBearerAuthorized("Bearer wrong-token", "long-random-token"), false);
  assert.equal(isBearerAuthorized(undefined, "long-random-token"), false);
});

test("limits stream URLs to one camera and a short expiry", () => {
  const token = createStreamToken("T8113ABC", 1_120, "long-random-token");
  assert.equal(validateStreamToken("T8113ABC", token, "long-random-token", 1_000), true);
  assert.equal(validateStreamToken("T8113OTHER", token, "long-random-token", 1_000), false);
  assert.equal(validateStreamToken("T8113ABC", token, "long-random-token", 1_121), false);
  assert.equal(validateStreamToken("T8113ABC", token, "wrong-token", 1_000), false);
});
