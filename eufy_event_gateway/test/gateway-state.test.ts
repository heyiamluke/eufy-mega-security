import assert from "node:assert/strict";
import test from "node:test";

import { GatewayState, normalizePersonName } from "../src/domain/gateway-state.js";

const camera = {
  serial: "camera-1",
  name: "Driveway",
  model: "T8142",
  stationSerial: "homebase-1",
  streamSupported: true,
};

test("retains a recognized person after the transient sensor clears", () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  state.recordPerson(camera.serial, true, "  Alex  ", new Date("2026-09-11T01:02:03Z"));
  state.recordPerson(camera.serial, false, null);

  const result = state.getCamera(camera.serial);
  assert.equal(result.personDetected, false);
  assert.equal(result.lastDetection?.personName, "Alex");
  assert.equal(result.lastDetection?.recognized, true);
  assert.equal(result.lastDetection?.occurredAt, "2026-09-11T01:02:03.000Z");
});

test("does not claim an identity for Eufy unknown values", () => {
  assert.equal(normalizePersonName(undefined), null);
  assert.equal(normalizePersonName(""), null);
  assert.equal(normalizePersonName("Unknown"), null);
  assert.equal(normalizePersonName("Unknown Person"), null);
  assert.equal(normalizePersonName("No Person"), null);
});

test("keeps person detection as the latest richer event after simultaneous motion", () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  state.recordMotion(camera.serial, true, new Date("2026-09-11T01:02:03Z"));
  state.recordPerson(camera.serial, true, "Alex", new Date("2026-09-11T01:02:04Z"));

  assert.equal(state.getCamera(camera.serial).lastDetection?.kind, "person");
});

test("does not downgrade a recent named-person detection when a generic motion pulse arrives", () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  state.recordPerson(camera.serial, true, "Alex", new Date("2026-09-11T01:02:03Z"));
  state.recordMotion(camera.serial, true, new Date("2026-09-11T01:02:04Z"));

  assert.equal(state.getCamera(camera.serial).lastDetection?.personName, "Alex");
});

test("records a later motion as a new detection", () => {
  const state = new GatewayState();
  state.registerCamera(camera);
  state.recordPerson(camera.serial, true, "Alex", new Date("2026-09-11T01:02:03Z"));
  state.recordMotion(camera.serial, true, new Date("2026-09-11T01:02:14Z"));

  assert.equal(state.getCamera(camera.serial).lastDetection?.kind, "motion");
});

test("clears detection pulses when a provider never sends a false event", async () => {
  const state = new GatewayState(10);
  state.registerCamera(camera);
  state.recordMotion(camera.serial, true);
  state.recordPerson(camera.serial, true, null);

  await new Promise((resolve) => setTimeout(resolve, 25));

  const result = state.getCamera(camera.serial);
  assert.equal(result.motionDetected, false);
  assert.equal(result.personDetected, false);
  assert.equal(result.lastDetection?.kind, "person");
});

test("extends a detection pulse when another true event arrives", async () => {
  const state = new GatewayState(25);
  state.registerCamera(camera);
  state.recordPerson(camera.serial, true, null);

  await new Promise((resolve) => setTimeout(resolve, 15));
  state.recordPerson(camera.serial, true, null);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(state.getCamera(camera.serial).personDetected, true);

  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(state.getCamera(camera.serial).personDetected, false);
});
