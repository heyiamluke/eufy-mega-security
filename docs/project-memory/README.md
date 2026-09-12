# Project memory

## Current architecture

The Home Assistant integration talks only to the companion gateway over its authenticated local API. The gateway owns the Eufy-specific protocol boundary.

As of v0.1.12, production authentication, device discovery, push-token registration, push normalization, media download, event-image decoding, and first-party PPCS camera streaming use gateway-owned implementations. `eufy-security-client` is not a runtime dependency. Generic Firebase Cloud Messaging delivery is provided by `@eneris/push-receiver`; no Eufy account or device behavior is delegated to it. The standard WebRTC peer implementation remains available only for the separate web transport code.

The supported Mega camera inventory types validated against the project hardware are 7 (video doorbell), 8 (HomeBase battery camera), and 10031 (T817L). HomeBase type 18 is retained only as parent metadata and is not registered as a camera.

The gateway's live transport is now proven directly through Eufy's first-party Mega/PPCS UDP path. The probe obtains station DSK keys and ECC cipher material from Eufy's APIs, performs PPCS lookup/handshake, requests camera video, writes raw H.264, and decodes a first-frame JPEG. It deliberately does not use `eufy-security-client`, the separate SmartLife/Thing login, or an expiring Web Portal Access PIN. The proof has produced real H.264 and JPEG bytes for the wired T8210 and battery T817L on the test account. Home Assistant live entities remain unvalidated until this gateway path is wired into the integration. Event sensors and retained event snapshots remain independent of live-stream support.

The Home Assistant app advertises a stable internal discovery hostname (`local-eufy-event-gateway`) rather than the add-on container hostname. This keeps the integration connected across local app rebuilds and restarts.

## Delivery state

v0.1.12 adds the gateway-only first-party PPCS proof and wires that transport into on-demand camera streaming. An existing valid Mega session is migrated once from the previous client state, then saved in the gateway-owned session format. New Mega authentication supports email verification and the app's CAPTCHA interface when Eufy requires either challenge. The separate web session remains independently scoped and stored for the web transport code.

Never log or expose credentials, session tokens, signing identities, raw signed media URLs, complete push payloads, or device serial numbers in diagnostics.
