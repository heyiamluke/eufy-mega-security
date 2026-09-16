/**
 * Sensor baseline candidates kept separate from camera admission.
 *
 * Standalone sensors are recognized from Mega inventory, but the current
 * gateway has no sensor state/event path or Home Assistant sensor entities.
 * These entries therefore remain discovery-only until our own path is built.
 */

import type { CoreCapabilityEntry } from "./device-capability-core.js";

/** Inventory types treated as sensor-family rows, not camera candidates. */
export const SENSOR_DEVICE_TYPES: ReadonlySet<number> = new Set([2, 10, 20, 21, 22, 123, 126, 127]);

/** Minimal reads and events a useful HA sensor baseline would need. */
export const SENSOR_CAPABILITY_CORE: readonly CoreCapabilityEntry[] = [
  { id: "sensor.contact_open", family: "contact", kind: "read", evidenceParamIds: [1550], gatewaySupport: "reference-only", note: "The current gateway does not retain or refresh the contact value." },
  { id: "sensor.contact_event", family: "contact", kind: "event", evidenceParamIds: [1550], gatewaySupport: "reference-only", note: "Requires our own open/closed push or station-notify decoding." },
  { id: "sensor.motion_event", family: "motion", kind: "event", evidenceParamIds: [], gatewaySupport: "reference-only", note: "Type 10 or a motion-specific report is a candidate, not proof of delivered pushes." },
  { id: "sensor.battery_level", family: "battery", kind: "read", evidenceParamIds: [1101], gatewaySupport: "reference-only", note: "A reported field is not a fresh percentage." },
  { id: "sensor.last_seen", family: "diagnostic", kind: "read", evidenceParamIds: [1551], gatewaySupport: "reference-only", note: "Timestamp freshness and units still need verification." },
] as const;
