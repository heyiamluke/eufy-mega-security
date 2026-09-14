/**
 * Covers the support-log formatting and disclosure boundary.
 *
 * These tests keep copied log lines chronological and self-identifying while
 * ensuring remote or multiline text cannot forge a second unprefixed record.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { formatLogLine } from "../src/logging.js";

test("adds time, severity, version, run, component, and event to a log line", () => {
  assert.equal(
    formatLogLine({
      timestamp: "2026-09-15T04:32:08.417Z",
      level: "INFO",
      version: "0.1.18",
      runId: "7f31c2ab",
      component: "provider",
      event: "connection_ready",
      message: "Eufy connection connected",
    }),
    "2026-09-15T04:32:08.417Z INFO version=0.1.18 run=7f31c2ab component=provider event=connection_ready Eufy connection connected",
  );
});

test("keeps untrusted multiline text inside one prefixed record", () => {
  assert.equal(
    formatLogLine({
      timestamp: "2026-09-15T04:32:08.417Z",
      level: "WARN",
      version: "0.1.18 beta",
      runId: "run with spaces",
      component: "web stream",
      event: "remote failure",
      message: "first line\nforged line\tremaining detail",
    }),
    "2026-09-15T04:32:08.417Z WARN version=0.1.18-beta run=run-with-spaces component=web-stream event=remote-failure first line forged line remaining detail",
  );
});

test("redacts common credentials and account email addresses", () => {
  assert.equal(
    formatLogLine({
      timestamp: "2026-09-15T04:32:08.417Z",
      level: "ERROR",
      version: "0.1.18",
      runId: "7f31c2ab",
      component: "process",
      event: "uncaught_exception",
      message: "user@example.com failed token=plain https://example.com/path?token=secret&mode=live with Bearer abc123",
    }),
    "2026-09-15T04:32:08.417Z ERROR version=0.1.18 run=7f31c2ab component=process event=uncaught_exception [redacted-email] failed token=[redacted] https://example.com/path?token=[redacted]&mode=live with Bearer [redacted]",
  );
});
