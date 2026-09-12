# File map

This repository has a deliberate split. The gateway knows about Eufy. The Home Assistant integration knows about Home Assistant. Keeping that line clear makes both sides easier to test and makes the Eufy protocol reusable outside Home Assistant.

If you are new to the project, read [`DEVELOPERS_START_HERE.md`](DEVELOPERS_START_HERE.md) first. It explains Mega, PPCS, authentication, event images, stream conversion, and the reason the standalone gateway exists. This page is the quick “where is that code?” index.

## Repository files

| Path | Purpose |
| --- | --- |
| `README.md` | User-facing installation, configuration, camera behaviour, and troubleshooting guide. |
| `CONTRIBUTING.md` | Development setup, test commands, protocol boundaries, pull request expectations, and release notes. |
| `SECURITY.md` | Private reporting and secret-handling rules. |
| `docs/DEVELOPERS_START_HERE.md` | First-day developer guide to the architecture, Mega/PPCS protocols, data transformations, and debugging workflow. |
| `docs/MEGA_PLATFORM.md` | Detailed Mega API, authentication, inventory, push, event-image, PPCS, and Home Assistant transformation reference. |
| `hacs.json` | HACS metadata for the custom integration. |
| `examples/node-red-gate-and-motion.json` | Importable Node-RED flow showing motion events and gateway actions. |
| `.github/workflows/validate.yml` | CI for gateway tests/build, HACS validation, and Home Assistant metadata. |
| `docs/project-memory/README.md` | Short record of the current architecture and delivery state. |

## Gateway app

### Startup and state

| Path | Purpose |
| --- | --- |
| `eufy_event_gateway/src/main.ts` | Composition root. Wires configuration, storage, provider callbacks, stream management, HTTP server, and shutdown without owning protocol rules. |
| `eufy_event_gateway/src/config.ts` | Converts environment strings into validated typed settings and enforces API-token rules for non-loopback listeners. |
| `eufy_event_gateway/src/server.ts` | Owns the authenticated health, camera, snapshot, stream, clip, SSE, diagnostics, and challenge-page HTTP boundary. |
| `eufy_event_gateway/src/domain/types.ts` | Stable protocol-neutral contracts for cameras, detections, snapshots, streams, connections, and diagnostics. |
| `eufy_event_gateway/src/domain/gateway-state.ts` | In-memory state machine for connection status, camera entities, transient detections, retained snapshots, and stream state. |
| `eufy_event_gateway/src/storage/snapshot-store.ts` | Persists one verified last-good image per camera with hashed filenames, serialized writes, and atomic replacement. |
| `eufy_event_gateway/src/provider/provider.ts` | Narrow adapter interface separating a real or simulated provider from state and HTTP code. |
| `eufy_event_gateway/src/provider/eufy-provider.ts` | Translates Mega inventory/push/media observations into provider callbacks and selects first-party PPCS for live video. |
| `eufy_event_gateway/src/provider/simulated-provider.ts` | Deterministic provider for local UI, API, SSE, and lifecycle testing without an Eufy account. |

### Mega protocol

| Path | Purpose |
| --- | --- |
| `src/mega/client.ts` | Production Mega account client: domain discovery, ECDH identity exchange, encrypted login/requests, session reuse, inventory, DSK/cipher lookup, push registration, and bounded media download. |
| `src/mega/crypto.ts` | Pure Mega key exchange, request signing, AES envelope, password encryption, login-hash, and token primitives. |
| `src/mega/types.ts` | Checked response and persisted-session contracts; not a raw undocumented API schema. |
| `src/mega/session-store.ts` | Private, atomic native Mega session persistence with one-time legacy migration. |
| `src/mega/push.ts` | Firebase receiver registration, persistent ID storage, nested notification parsing, event normalization, and safe diagnostics. |
| `src/mega/image.ts` | JPEG detection and decoding of Eufy event-image wrappers, including encrypted legacy bytes. |
| `src/mega/web-client.ts` | Separate Web API session used only by the challenge page and legacy WebRTC experiment. |
| `src/mega/web-crypto.ts` | Cryptographic helpers for the Web API session; intentionally separate from Mega crypto. |
| `src/mega/web-session-store.ts` | Private persistence for the expiring Web API session. |
| `src/mega/web-types.ts` | Types for the Web API's authentication, device, and signalling responses. |
| `src/mega/native-mqtt.ts` | Legacy Thing mutual-TLS MQTT connection and framing, retained for research and not selected in production. |
| `src/mega/native-p2p.ts` | Legacy Thing/P2P message framing and signalling helpers for packet experiments. |
| `src/mega/native-media.ts` | Legacy native relay encryption/framing helpers used by the isolated transport research. |
| `src/mega/native-relay.ts` | Legacy relay TCP connection and handshake implementation. |
| `src/mega/native-relay-session.ts` | Legacy KCP control/video session over the relay. |
| `src/mega/thing-gateway.ts` | Legacy SmartLife/Thing account client, deliberately outside the production Mega path. |

### Video and media

| Path | Purpose |
| --- | --- |
| `src/stream/first-party-ppcs.ts` | Production Eufy PPCS UDP lookup, CAM_CHECK, HomeBase key unwrap, media request, H.264 extraction, and heartbeat. PPCS means Eufy's peer-to-peer camera transport. |
| `src/stream/live-stream-manager.ts` | Shares a provider H.264 source, feeds FFmpeg for snapshots/clips, bounds recordings, and stops idle sessions. |
| `src/stream/jpeg-parser.ts` | Reassembles complete JPEG frames from arbitrary FFmpeg stdout chunks. |
| `src/stream/h264-rtp.ts` | Reassembles H.264 NAL units from RTP packets for the isolated WebRTC path. |
| `src/stream/web-rtc-stream.ts` | Legacy Web API WebRTC signalling and RTP media session, not production Mega/PPCS. |
| `src/stream/native-stream-session.ts` | Composes the legacy MQTT, P2P, relay, KCP, and FFmpeg path for research only. |
| `scripts/ppcs-probe.ts` | Safe standalone proof tool that enumerates cameras and records PPCS byte/frame results. |

## Home Assistant integration

| Path | Purpose |
| --- | --- |
| `custom_components/eufy_event_gateway/manifest.json` | Integration metadata, version, documentation, and issue links. |
| `custom_components/eufy_event_gateway/__init__.py` | Creates the gateway client/coordinator and forwards entity platforms. |
| `custom_components/eufy_event_gateway/config_flow.py` | Manual and Supervisor discovery flows, connection validation, and reconfiguration. |
| `custom_components/eufy_event_gateway/client.py` | Authenticated HTTP/SSE client for the gateway API. |
| `custom_components/eufy_event_gateway/coordinator.py` | Polling recovery plus reconnecting SSE updates. |
| `custom_components/eufy_event_gateway/entity.py` | Shared device registry information and availability for all entities. |
| `custom_components/eufy_event_gateway/camera.py` | Retained-image cameras, live stream URLs, fresh snapshots, and clip actions. |
| `custom_components/eufy_event_gateway/binary_sensor.py` | Motion and person binary sensors. |
| `custom_components/eufy_event_gateway/sensor.py` | Last-recognized-person sensor and detection metadata. |
| `custom_components/eufy_event_gateway/const.py` | Domain, API-token key, and platform constants. |
| `custom_components/eufy_event_gateway/services.yaml` | Service descriptions for snapshot and clip actions. |
| `custom_components/eufy_event_gateway/strings.json` | Config-flow and entity translation keys. |
| `custom_components/eufy_event_gateway/translations/en.json` | English translations used by Home Assistant. |

## Tests

The gateway tests live in `eufy_event_gateway/test`. They cover configuration, crypto, Mega session and push handling, image decoding, state transitions, native transport framing, PPCS helpers, snapshots, HTTP authentication, and the simulated provider. Add a focused test beside the module it protects. Keep real-account probes in `scripts/ppcs-probe.ts`, not in the automated test suite.
