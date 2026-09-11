# Delivery status

## Current phase

Initial public release candidate. The full Home Assistant OS installation and real-hardware path have been validated locally.

Version 0.1.1 is the first update-path validation release. It adds the packaged integration brand icon and is used to verify HACS discovery, download, restart, and rendered integration-card behaviour against the public GitHub repository.

## Implemented locally

- Normalized camera, connection, detection, snapshot, and stream state.
- Durable atomic snapshot storage.
- Eufy provider bindings for camera discovery, motion/person/name events, event images, and P2P H.264 streams.
- Viewer-counted live endpoint with delayed shutdown.
- Periodic live-frame JPEG extraction through FFmpeg.
- JSON, snapshot, raw-stream, health, and server-sent-event endpoints.
- Simulated provider and automated domain/storage/parser tests.
- Eufy Mega v6 inventory merged with the legacy device list using the request verified from the current Android app.
- Home Assistant custom integration with camera, motion, person, and remembered recognized-person entities.
- Reconnecting server-sent event updates, a recovery poll, bearer-token API protection, and short-lived FFmpeg stream URLs.
- A Home Assistant OS local app that generates its own internal API token, announces the private connection through Supervisor discovery, and persists its Eufy session and snapshots.
- Home Assistant snapshot and timed-recording actions suitable for native automations and Node-RED Home Assistant nodes.
- Public-repository packaging that supports both a HACS custom integration and a Home Assistant third-party app repository from one URL.

## Next gateway gate

Publish the validated 0.1.0 source and use field reports to broaden the tested camera matrix. Familiar-person names remain dependent on HomeBase supplying an explicit identity in the event payload.

## Hardware evidence from 2026-09-11

- Connected successfully to one HomeBase 3 and discovered four cameras: three T8113-Z cameras and one T8210 doorbell.
- All four cameras supplied valid 640 by 360 event JPEGs during initialization.
- The Path camera woke on demand and supplied 654,250 bytes of valid H.264 over a 12-second sample.
- The decoded stream was 1920 by 1080 at 30 frames per second.
- Live-frame extraction produced valid 1920 by 1080 JPEG placeholders.
- After the last viewer disconnected, the stream stopped after the configured ten-second grace period and returned cleanly to idle.
- Front of House supplied an HB3 notification naming a familiar resident during the protocol probe. The gateway's narrow identity-text parser recognizes explicit identity wording on both identity and face-detection packets without treating generic labels such as `Someone` or `Stranger` as names.
- Path produced paired HB3 face-detection notifications and normalized correctly as an unidentified person. Its notification said that someone was spotted.
- Front of House is a powered Eufy Wired Cam C31 (T817L, device type 10031) with its own RTSP feed. The released upstream client does not yet classify this type as a camera, although its HB3 notifications arrive. The gateway now recognizes T817L inventory records explicitly for detection events while leaving its video on RTSP.
- The legacy device-list API omits the C31 entirely: it returns only the three T8113-Z cameras and the T8210 doorbell. The independent HB3 push channel still delivers C31 events.
- Runtime-unpacked Eufy Security code revealed the current Mega device-list request. A live signed and encrypted call returned the expected inventory, including Front of House immediately after that camera was shared to the dedicated integration account.
- The gateway merges legacy and Mega inventory without allowing Mega failure to disrupt legacy discovery. Mega-only cameras use the corrected persistent push fallback; repeated detections are no longer discarded after the first event.
- Home Assistant Core 2026.6.2 loaded the local custom integration and created five camera devices with twenty entities.
- Opening Path in Home Assistant obtained an authenticated short-lived stream URL, woke the camera, displayed current video, and retained a new live frame. Closing the view released the only viewer; the gateway stopped the P2P stream after its grace period and Home Assistant returned to `Idle` through the event stream.
- Fresh Front of House events reached Home Assistant as person detections and cleared automatically after ten seconds. Three validation passes contained no identity from Eufy, so Home Assistant correctly retained `Unknown`; a named event remains dependent on HomeBase recognizing a familiar face and supplying the name.
- The packaged Home Assistant OS app generated its own private API token, announced its internal address through Supervisor discovery, survived a Home Assistant restart, and reconnected to Eufy without exposing its API port to the LAN.
- `eufy_event_gateway.capture_snapshot` woke Path, saved a valid 156,135-byte JPEG under `/media/eufy`, and returned the camera to idle.
- `eufy_event_gateway.record_clip` woke the Doorbell, captured five seconds through the gateway, saved a valid 710,639-byte fragmented MP4 atomically under `/media/eufy`, and returned the camera to idle after the grace period. Moving the bounded recording into the gateway removed a hang observed with Home Assistant's generic `camera.record` action.

## Mega v6 investigation

- The current read-only Security inventory route, request schema, and response fields are now verified from both runtime-unpacked app code and a successful live call.
- The T817L sharing experiment confirms the Mega inventory respects the dedicated account's per-device authorization.
- See [Mega protocol research](mega-protocol-research.md) for the protocol boundary and retained evidence.
