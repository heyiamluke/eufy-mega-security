# Sensor, HomeBase, and doorbell baselines

The Mega gateway now records small core capability decisions for these three device families. Each family has a definition-only core file, and the camera, sensor, HomeBase, and doorbell rows pass through one shared evaluator. The authenticated `GET /api/device-capabilities` endpoint shows recognition, gateway support, per-row evidence, and whether an existing path can be offered. It contains no current sensor parameter values and does not create Home Assistant entities.

HomeBase 3, T8030/type 18, has an existing station path. Its core catalogue lists inventory availability, connection, guard and effective modes, alarm state, volume and tone controls, firmware, and eMMC/HDD storage. A ready route indicates the station read or command path is available, not that a particular value has been refreshed. T9000/type 27 is recognized as a station-class peer but remains outside these controls. Its command protocol is not verified.

Doorbells keep their existing camera media, motion/person events, and battery read candidates. The doorbell-specific core row is the transient press event already routed from known push code 3103. A doorbell's camera route can be ready without proving that press notifications or video work on that physical model. The MiniBase Chime is a media peer, not a doorbell entity.

Known standalone sensor types are kept out of camera admission. The sensor core records contact, motion, battery, and last-seen candidates. None is marked as supported yet. The gateway currently does not decode standalone sensor state or publish sensor entities to Home Assistant. A reported contact or battery parameter identifies a possible read but is not a fresh open/closed state or percentage.

The gateway will add optional features only after building and testing its own decode or command path. Grouped diagnostics now show the family admission decision, whether an HA adapter exists, reported core fields, unimplemented reads, route readiness, and currently offerable gateway paths. They omit device names, serials, raw parameter values, and push payloads. Recognition alone never admits a sensor or an unverified station.
