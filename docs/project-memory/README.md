# Project memory

## Current architecture

The Home Assistant integration talks only to the companion gateway over its authenticated local API. The gateway owns the Eufy-specific protocol boundary.

As of v0.1.12, production authentication, device discovery, push-token registration, push normalization, media download, event-image decoding, and first-party PPCS camera streaming use gateway-owned implementations. `eufy-security-client` is not a runtime dependency. Generic Firebase Cloud Messaging delivery is provided by `@eneris/push-receiver`; no Eufy account or device behavior is delegated to it. The standard WebRTC peer implementation remains available only for the separate web transport code.

The supported Mega camera inventory types validated against the project hardware are 7 (video doorbell), 8 (HomeBase battery camera), and 10031 (T817L). HomeBase type 18 is retained only as parent metadata and is not registered as a camera.

The gateway's live transport is now proven directly through Eufy's first-party Mega/PPCS UDP path. The probe obtains station DSK keys and ECC cipher material from Eufy's APIs, performs PPCS lookup/handshake, requests camera video, writes raw H.264, and decodes a first-frame JPEG. It deliberately does not use `eufy-security-client`, the separate SmartLife/Thing login, or an expiring Web Portal Access PIN. A five-camera probe produced H.264 and JPEG bytes for Path, Back door, Doorbell, and Front of House. Garden and Pool completed the PPCS and level-2 handshakes but was out of battery during the no-video probe, so no protocol failure is established. In Home Assistant, the recreated integration exposes five cameras and Path has produced a live image and fresh snapshot. Event sensors and retained event snapshots remain independent of live-stream support.

The Home Assistant app advertises the Supervisor-assigned app hostname discovered from inside the container. This keeps the integration connected across local app rebuilds, repository installs, and restarts without hard-coding a repository-specific slug.

## Delivery state

v0.1.18 makes copied support logs self-identifying. Every gateway-owned line carries a UTC timestamp, severity, release version, per-process run ID, component, and stable event name. Explicit start, listening, stop, and fatal events reveal restart boundaries; expected readiness-probe failures are suppressed. Grouped inventory lines expose model, type, category, acceptance, station, and stream-readiness decisions without device names or serial numbers. The logging boundary accepts only human-readable messages, redacts common credentials and account email addresses, and keeps stack frames attached to the same version and run without logging raw provider objects.

v0.1.17 shows the empty verification-code field directly in app configuration without an optional-field toggle. After the provider connects, cameras without a retained image receive sequential first-run snapshot captures; sleeping or failed cameras do not block the remaining queue and remain eligible on a later startup. The app entrypoint traps Supervisor termination, waits for the gateway process, and exits successfully so an intentional stop is not reported as exit code 143.

v0.1.16 fixes first-sign-in email verification across the app restart documented for the configuration-field fallback. The gateway persists Eufy's limited pre-verification Mega session before returning the challenge, then submits the code with that same token after restart. The Web UI also routes email verification through the active Mega client rather than the separate legacy web session.

v0.1.15 adds the first-day developer guide, the detailed Mega platform reference, and the file-level source/test documentation needed for outside testers and contributors. The public and app READMEs link directly to those documents. This release does not change the runtime protocol path.

v0.1.13 renames the user-facing project, Home Assistant integration, and HACS repository to Eufy Mega Security while preserving the internal `eufy_event_gateway` domain, service namespace, app slug, and discovery service for existing installations. Those internal identifiers are intentional compatibility names, not stale user-facing branding.

v0.1.12 adds the gateway-only first-party PPCS proof and wires that transport into on-demand camera streaming. An existing valid Mega session is migrated once from the previous client state, then saved in the gateway-owned session format. New Mega authentication supports email verification and the app's CAPTCHA interface when Eufy requires either challenge. The separate web session remains independently scoped and stored for the web transport code.

Never log or expose credentials, session tokens, signing identities, raw signed media URLs, complete push payloads, or device serial numbers in diagnostics.
