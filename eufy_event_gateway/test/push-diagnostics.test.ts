import assert from "node:assert/strict";
import test from "node:test";

import { GatewayState } from "../src/domain/gateway-state.js";
import type { PushDiagnostic } from "../src/domain/types.js";

test("push diagnostics are bounded to the latest 50 whitelisted records", () => {
  const state = new GatewayState();
  for (let index = 0; index < 55; index += 1) {
    const diagnostic: PushDiagnostic = {
      receivedAt: new Date(index * 1_000).toISOString(),
      cameraSerial: `camera-${index}`,
      cameraName: `Camera ${index}`,
      type: 1,
      eventType: 2,
      messageType: 3,
      notificationStyle: 1,
      personName: null,
      hasPersonName: false,
      hasPictureUrl: true,
      hasFilePath: false,
      hasFetchId: false,
      hasSenseId: false,
    };
    state.recordPushDiagnostic(diagnostic);
  }

  const diagnostics = state.listPushDiagnostics();
  assert.equal(diagnostics.length, 50);
  assert.equal(diagnostics[0]?.cameraSerial, "camera-5");
  assert.equal(diagnostics[49]?.cameraSerial, "camera-54");
});
