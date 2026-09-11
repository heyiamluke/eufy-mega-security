# Product and architecture

## Product intent

Make battery-powered Eufy cameras useful and predictable in Home Assistant without pretending they provide an always-on stream.

For each camera, Home Assistant should receive motion and person detections, the HomeBase 3 familiar-person name when Eufy supplies it, on-demand live video, and the last good video or event frame whenever live video is unavailable.

## Behavioural decisions

- An idle or sleeping camera is healthy, not unavailable.
- A detected identity is optional. Unknown Eufy values are represented as no recognized identity.
- The latest meaningful detection and its timestamp survive the transient motion/person flag returning to false.
- The displayed still is the newest successfully decoded live frame, otherwise the newest event image, otherwise the previous valid still.
- Empty, corrupt, or failed image retrieval must not erase the previous valid still.
- Opening live video acquires a stream lease. The gateway closes a stream it started after all viewers leave and a short grace period expires.
- Motion alone does not start a livestream.

## Architecture boundary

`eufy-security-client` owns Eufy's undocumented cloud, push, HomeBase, and P2P protocols. This project owns normalized state, recovery policy, snapshot durability, stream leases, diagnostics, the local API, and the Home Assistant experience.

The Home Assistant integration consumes server-sent state updates and keeps a 60-second recovery poll. Each camera exposes a durable still; only cameras with controllable P2P video advertise live streaming. An authenticated Home Assistant instance obtains a short-lived, camera-specific stream URL so its separate FFmpeg process never needs the long-lived gateway token.

Known powered RTSP cameras may use Eufy push events for HomeBase detections while their video continues to use the camera's standard RTSP feed. They must not be forced through the battery-camera P2P lifecycle.

Credentials and session data are runtime-only. They must never enter source control, fixtures, diagnostics, screenshots, or project memory.

Container liveness is independent of Eufy account connectivity. Authentication prompts and temporary Eufy outages must remain visible as connection state rather than causing Supervisor watchdog restart loops.
