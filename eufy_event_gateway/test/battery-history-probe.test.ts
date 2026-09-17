/**
 * Verifies that the battery-history diagnostic exposes schema only.
 *
 * The PPCS session owns raw parameter decoding; support logs consume this
 * summary and must never receive timestamps, identifiers, or measurements.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { batteryHistoryProbeSummary } from "../src/stream/first-party-ppcs.js";

test("summarizes battery-history structure without values", () => {
  const summary = batteryHistoryProbeSummary(JSON.stringify({
    days: 42,
    last_charge: 1_789_000_123,
    samples: [{ timestamp: 1_789_000_123, percentage: 98 }],
    private_label: "Front door",
  }));

  assert.equal(
    summary,
    "object{days:number,last_charge:number,private_label:string,samples:array[object]}",
  );
  assert.equal(summary.includes("42"), false);
  assert.equal(summary.includes("1789000123"), false);
  assert.equal(summary.includes("Front door"), false);
});

test("bounds malformed and oversized battery-history values", () => {
  assert.equal(batteryHistoryProbeSummary("not-json"), "invalid-json");
  assert.equal(batteryHistoryProbeSummary("x".repeat(65_537)), "invalid-size");
});
