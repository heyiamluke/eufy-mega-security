/**
 * Tests the provider's pure Mega-to-domain transformations.
 *
 * The cases cover inventory field aliases, safe diagnostics and push logs,
 * and conservative person-name rules without starting a real account or push
 * receiver.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  inventoryDiagnostics,
  inventoryLogSummaries,
  isPpcsStreamSupported,
  parseMegaInventory,
  personNameFromPush,
  ppcsStreamRoute,
  safePushLogSummary,
} from "../src/provider/eufy-provider.js";

const event = (overrides: Partial<Parameters<typeof personNameFromPush>[0]>): Parameters<typeof personNameFromPush>[0] => ({
  eventType: null,
  personName: null,
  content: null,
  ...overrides,
});

test("uses a structured person name when Eufy supplies one", () => {
  assert.equal(personNameFromPush(event({ eventType: 3111, personName: "Alex" })), "Alex");
});

test("extracts a name from explicit HB3 identity notification text", () => {
  assert.equal(personNameFromPush(event({ eventType: 3111, content: "Alex has been detected." })), "Alex");
  assert.equal(personNameFromPush(event({ eventType: 3111, content: "Front of House: Alex was spotted in the garden" })), "Alex");
});

test("never infers an identity from generic or non-identity notifications", () => {
  assert.equal(personNameFromPush(event({ eventType: 3111, content: "Someone has been spotted" })), null);
  assert.equal(personNameFromPush(event({ eventType: 3111, content: "Stranger was spotted" })), null);
  assert.equal(personNameFromPush(event({ eventType: 3101, content: "Alex has been detected" })), null);
});

test("parses only whitelisted Mega inventory fields and de-duplicates serials", () => {
  const result = parseMegaInventory({ devices: [{
    device_sn: "T8113ABC", device_name: "Path", device_model: "T8113-Z", parent_sn: "T8030ABC",
    device_type: 8, device_channel: 3, category: "eufy_security", p2p_did: "ABC-123456-XYZ",
    device_key: "must-not-escape",
  }, { device_sn: "T8113ABC", device_name: "duplicate" }, { device_name: "missing serial" }] });

  assert.deepEqual(result, [{
    serial: "T8113ABC", name: "Path", model: "T8113-Z", parentSerial: "T8030ABC",
    deviceType: 8, category: "eufy_security", channel: 3, p2pDid: "ABC-123456-XYZ",
    adminUserId: null, userName: null, firmware: null, p2pConnection: null, cipherId: null,
  }]);
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
});

test("inherits the HomeBase live-view account identity for child cameras", () => {
  const devices = parseMegaInventory({ devices: [
    { device_sn: "camera", parent_sn: "homebase", device_type: 8, category: "eufy_security" },
    { device_sn: "homebase", device_type: 18, category: "eufy_security", member: { admin_user_id: "owner" } },
  ] });
  assert.equal(devices.find(({ serial }) => serial === "camera")?.adminUserId, "owner");
});

test("classifies recognized Mega camera types without admitting stations or unknown devices", () => {
  const devices = parseMegaInventory({ devices: [
    { device_sn: "doorbell", device_name: "Door", device_model: "T8210", parent_sn: "homebase", device_type: 7, category: "eufy_security" },
    { device_sn: "battery", device_name: "Path", device_model: "T8113-Z", parent_sn: "homebase", device_type: 8, category: "eufy_security" },
    { device_sn: "s330", device_name: "Garden", device_model: "T8160", parent_sn: "homebase", device_type: 19, category: "eufy_security" },
    { device_sn: "s300", device_name: "Side", device_model: "T8161", parent_sn: "homebase", device_type: 23, category: "eufy_security" },
    { device_sn: "wall-light", device_name: "Side", device_model: "T84A1", device_type: 151, device_channel: 0, category: "eufy_security" },
    { device_sn: "indoor", device_name: "Indoor", device_model: "T8410", parent_sn: "homebase", device_type: 31, category: "eufy_security" },
    { device_sn: "solocam", device_name: "SoloCam", device_model: "T8134", parent_sn: "homebase", device_type: 63, category: "eufy_security" },
    { device_sn: "new-doorbell", device_name: "Front", device_model: "T8213", parent_sn: "homebase", device_type: 91, category: "eufy_security" },
    { device_sn: "wired", device_name: "Front", device_model: "T817L", parent_sn: "homebase", device_type: 10031, category: "eufy_security" },
    { device_sn: "homebase", device_name: "HomeBase", device_model: "T8030", device_type: 18, category: "eufy_security" },
    { device_sn: "unknown", device_name: "Unknown", device_model: "T9999", device_type: 999, category: "eufy_security" },
    { device_sn: "wrong-category", device_name: "Wrong category", device_model: "T8134", device_type: 63, category: "other" },
  ] });
  assert.deepEqual(inventoryDiagnostics(devices).map(({ serial, acceptedAsCamera }) => [serial, acceptedAsCamera]), [
    ["doorbell", true], ["battery", true], ["s330", true], ["s300", true], ["wall-light", true], ["indoor", true],
    ["solocam", true], ["new-doorbell", true], ["wired", true], ["homebase", false],
    ["unknown", false], ["wrong-category", false],
  ]);
});

test("accepts T8161 inventory through a ready HomeBase 3", () => {
  const devices = parseMegaInventory({ devices: [
    {
      device_sn: "camera", device_model: "T8161", parent_sn: "station", device_type: 23,
      device_channel: 2, category: "eufy_security",
    },
    {
      device_sn: "station", device_model: "T8030", device_type: 18,
      category: "eufy_security", p2p_did: "did", p2p_conn: "connection",
    },
  ] });
  const summaries = inventoryLogSummaries(devices, new Set(["station"]));
  assert.equal(summaries[0]?.acceptedAsCamera, true);
  assert.equal(summaries[0]?.streamRoute, "homebase");
  assert.equal(summaries[0]?.streamSupported, true);
});

test("accepts SoloCam C20 inventory through a ready HomeBase 3", () => {
  const devices = parseMegaInventory({ devices: [
    {
      device_sn: "camera", device_model: "T8134", parent_sn: "station", device_type: 63,
      device_channel: 4, category: "eufy_security",
    },
    {
      device_sn: "station", device_model: "T8030", device_type: 18,
      category: "eufy_security", p2p_did: "did", p2p_conn: "connection",
    },
  ] });
  const summaries = inventoryLogSummaries(devices, new Set(["station"]));
  assert.equal(summaries[0]?.acceptedAsCamera, true);
  assert.equal(summaries[0]?.streamSupported, true);
  assert.equal(summaries[1]?.acceptedAsCamera, false);
});

test("logs safe motion routing for a T8210 without private push fields", () => {
  const event = {
    eventType: 3101, messageType: 1, notificationStyle: 2, alarmType: null,
    pictureUrl: "https://example.invalid/private?access_token=secret",
    cameraSerial: "PRIVATE-SERIAL", cameraName: "Front Porch", personName: "Alex",
    content: "Alex rang the bell",
  };
  const summary = safePushLogSummary(event, {
    model: "T8210", category: "eufy_security", deviceType: 7,
  }, true, true);
  assert.match(summary, /model=T8210 .*event_type=3101 message_type=1 notification_style=2 handling=motion picture_present=true/);
  for (const privateValue of ["PRIVATE-SERIAL", "Front Porch", "Alex", "secret", "example.invalid"]) {
    assert.equal(summary.includes(privateValue), false);
  }
});

test("logs an unhandled T8210 notification without assuming it was a doorbell press", () => {
  const summary = safePushLogSummary({
    eventType: 3001, messageType: 9, notificationStyle: null,
    pictureUrl: null, alarmType: null,
  }, { model: "T8210", category: "eufy_security", deviceType: 7 }, true, false);
  assert.match(summary, /model=T8210 device_known=true camera_accepted=true station_present=true station_managed=false/);
  assert.match(summary, /event_type=3001 message_type=9 notification_style=missing handling=unhandled picture_present=false/);
});

test("does not report unsupported HomeBase inventory as a handled camera event", () => {
  const summary = safePushLogSummary({
    eventType: 3101, messageType: 1, notificationStyle: null,
    pictureUrl: null, alarmType: null,
  }, { model: "T8010", category: "eufy_security", deviceType: 0 }, true, false);
  assert.match(summary, /model=T8010 device_known=true camera_accepted=false station_present=true station_managed=false/);
  assert.match(summary, /handling=unhandled/);
});

test("rejects arbitrary inventory labels and invalid push codes from copyable logs", () => {
  const summary = safePushLogSummary({
    eventType: -1, messageType: 999_999, notificationStyle: null,
    pictureUrl: null, alarmType: null,
  }, { model: "Front Porch private@example.invalid", category: "eufy_security", deviceType: 7 }, false, false);
  assert.match(summary, /model=unknown/);
  assert.match(summary, /event_type=missing message_type=missing notification_style=missing handling=unhandled/);
  assert.equal(summary.includes("Front Porch"), false);
  assert.equal(summary.includes("private@example.invalid"), false);
});

test("groups safe inventory evidence without names or serial numbers", () => {
  const devices = parseMegaInventory({ devices: [
    {
      device_sn: "private-camera-one", device_name: "Private place", device_model: "S330",
      parent_sn: "private-homebase", device_type: 8, device_channel: 1, category: "eufy_security",
    },
    {
      device_sn: "private-camera-two", device_name: "Another private place", device_model: "S330",
      parent_sn: "private-homebase", device_type: 8, device_channel: 2, category: "eufy_security",
    },
    {
      device_sn: "private-homebase", device_name: "Private HomeBase", device_model: "S380",
      device_type: 18, category: "eufy_security", p2p_did: "private-did", p2p_conn: "private-connection",
    },
    {
      device_sn: "private-wall-light", device_name: "Private wall", device_model: "T84A1",
      device_type: 151, device_channel: 0, category: "eufy_security", p2p_did: "direct-did", p2p_conn: "direct-connection",
    },
  ] });

  const summaries = inventoryLogSummaries(devices, new Set(["private-homebase", "private-wall-light"]));

  assert.deepEqual(summaries, [
    {
      count: 2, model: "S330", deviceType: 8, category: "eufy_security", hasParent: true,
      hasChannel: true, acceptedAsCamera: true, stationPresent: true, stationPpcsReady: true,
      stationDskReady: true, streamRoute: "homebase", peerPpcsReady: true, peerDskReady: true, streamSupported: true,
    },
    {
      count: 1, model: "S380", deviceType: 18, category: "eufy_security", hasParent: false,
      hasChannel: false, acceptedAsCamera: false, stationPresent: false, stationPpcsReady: false,
      stationDskReady: false, streamRoute: "unavailable", peerPpcsReady: false, peerDskReady: false, streamSupported: false,
    },
    {
      count: 1, model: "T84A1", deviceType: 151, category: "eufy_security", hasParent: false,
      hasChannel: true, acceptedAsCamera: true, stationPresent: false, stationPpcsReady: false,
      stationDskReady: false, streamRoute: "direct", peerPpcsReady: true, peerDskReady: true, streamSupported: true,
    },
  ]);
  assert.equal(JSON.stringify(summaries).includes("private-camera"), false);
  assert.equal(JSON.stringify(summaries).includes("Private place"), false);
});

test("routes a standalone camera through its own PPCS peer", () => {
  const [wallLight] = parseMegaInventory({ devices: [{
    device_sn: "wall-light", device_model: "T84A1", device_type: 151, device_channel: 0,
    category: "eufy_security", p2p_did: "direct-did", p2p_conn: "direct-connection",
  }] });
  assert.ok(wallLight);
  const devices = new Map([[wallLight.serial, wallLight]]);
  assert.deepEqual(ppcsStreamRoute(wallLight, devices), { peer: wallLight, homeBaseAttached: false });
  assert.equal(isPpcsStreamSupported(wallLight, devices, new Set([wallLight.serial])), true);
});

test("uses a self-parented camera as its own PPCS peer and blocks a missing parent", () => {
  const [selfParented, missingParent] = parseMegaInventory({ devices: [
    {
      device_sn: "self-parented", parent_sn: "self-parented", device_model: "T84A1", device_type: 151,
      device_channel: 0, category: "eufy_security", p2p_did: "direct-did", p2p_conn: "direct-connection",
    },
    {
      device_sn: "missing-parent", parent_sn: "absent-homebase", device_model: "T84A1", device_type: 151,
      device_channel: 0, category: "eufy_security", p2p_did: "direct-did", p2p_conn: "direct-connection",
    },
  ] });
  assert.ok(selfParented && missingParent);
  const devices = new Map([[selfParented.serial, selfParented], [missingParent.serial, missingParent]]);
  assert.deepEqual(ppcsStreamRoute(selfParented, devices), { peer: selfParented, homeBaseAttached: false });
  assert.equal(isPpcsStreamSupported(missingParent, devices, new Set([missingParent.serial])), false);
});
