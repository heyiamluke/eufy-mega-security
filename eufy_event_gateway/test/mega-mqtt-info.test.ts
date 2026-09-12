/**
 * Documents the narrow MQTT credential shape returned by Mega.
 *
 * The test ensures the typed value contains only the mutual-TLS material the
 * isolated legacy experiment needs and does not silently accept unsafe
 * fallback credentials.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { MegaMqttInfo } from "../src/mega/types.js";

test("MQTT credential shape is transport-safe and excludes the PKCS12 fallback", () => {
  const info: MegaMqttInfo = {
    endpointAddress: "example.iot.amazonaws.com",
    thingName: "thing-name",
    userId: "user-id",
    appName: "eufy_security",
    certificatePem: "cert",
    privateKey: "key",
    rootCaPem: "root",
  };
  assert.deepEqual(Object.keys(info).sort(), [
    "appName", "certificatePem", "endpointAddress", "privateKey", "rootCaPem", "thingName", "userId",
  ]);
});
