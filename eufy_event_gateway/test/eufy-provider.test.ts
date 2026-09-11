import assert from "node:assert/strict";
import test from "node:test";

import {
  hasValidMegaSession,
  mergeInventoryDiagnostics,
  parseMegaInventory,
  personNameFromPush,
} from "../src/provider/eufy-provider.js";

test("uses a valid Mega session without requiring the failed legacy login", async () => {
  assert.equal(await hasValidMegaSession({
    megaTransition: { getMegaApi: async () => ({ hasValidSession: () => true }) },
  }), true);
  assert.equal(await hasValidMegaSession({}), false);
});

test("uses a structured person name when Eufy supplies one", () => {
  assert.equal(personNameFromPush({ event_type: 3111, person_name: "Alex" }), "Alex");
});

test("extracts a name from explicit HB3 identity notification text", () => {
  assert.equal(personNameFromPush({ event_type: 3111, content: "Alex has been detected." }), "Alex");
  assert.equal(personNameFromPush({ event_type: 3111, content: "Front of House: Alex was spotted in the garden" }), "Alex");
});

test("extracts an explicit recognized name when HB3 labels the packet as face detection", () => {
  assert.equal(
    personNameFromPush({ event_type: 3102, content: "Alex has been spotted." }),
    "Alex",
  );
});

test("never infers an identity from generic or non-identity notifications", () => {
  assert.equal(personNameFromPush({ event_type: 3111, content: "Someone has been spotted" }), null);
  assert.equal(personNameFromPush({ event_type: 3111, content: "Stranger was spotted" }), null);
  assert.equal(personNameFromPush({ event_type: 3101, content: "Alex has been detected" }), null);
});

test("parses only whitelisted Mega inventory fields and de-duplicates serials", () => {
  const result = parseMegaInventory({
    devices: [
      {
        device_sn: "T817L123",
        device_name: "Front of House",
        device_model: "T817L",
        parent_sn: "T8030ABC",
        device_type: 10031,
        category: "eufy_security",
        device_key: "must-not-escape",
      },
      { device_sn: "T817L123", device_name: "duplicate" },
      { device_name: "missing serial" },
    ],
  });

  assert.deepEqual(result, [{
    serial: "T817L123",
    name: "Front of House",
    model: "T817L",
    parentSerial: "T8030ABC",
    deviceType: 10031,
    category: "eufy_security",
  }]);
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
});

test("merges Mega metadata into legacy inventory and admits a Mega-only C31", () => {
  const result = mergeInventoryDiagnostics([
    {
      serial: "T8113ABC",
      name: "Path",
      model: "T8113-Z",
      sources: ["legacy"],
      upstreamIsCamera: true,
      acceptedAsCamera: true,
      megaDeviceType: null,
      category: null,
    },
  ], [
    { serial: "T8113ABC", name: "Path", model: "T8113-Z", parentSerial: "T8030", deviceType: 8, category: "eufy_security" },
    { serial: "T817L123", name: "Front", model: "T817L", parentSerial: "T8030", deviceType: 10031, category: "eufy_security" },
  ]);

  assert.deepEqual(result, [
    {
      serial: "T8113ABC",
      name: "Path",
      model: "T8113-Z",
      sources: ["legacy", "mega"],
      upstreamIsCamera: true,
      acceptedAsCamera: true,
      megaDeviceType: 8,
      category: "eufy_security",
    },
    {
      serial: "T817L123",
      name: "Front",
      model: "T817L",
      sources: ["mega"],
      upstreamIsCamera: false,
      acceptedAsCamera: true,
      megaDeviceType: 10031,
      category: "eufy_security",
    },
  ]);
});
