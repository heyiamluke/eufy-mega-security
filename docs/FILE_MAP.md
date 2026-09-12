# File map

This repository has a deliberate split. The gateway knows about Eufy. The Home Assistant integration knows about Home Assistant. Keeping that line clear makes both sides easier to test.

## Repository files

| Path | Purpose |
| --- | --- |
| `README.md` | User-facing installation, configuration, camera behaviour, and troubleshooting guide. |
| `CONTRIBUTING.md` | Development setup, test commands, protocol boundaries, pull request expectations, and release notes. |
| `SECURITY.md` | Private reporting and secret-handling rules. |
| `hacs.json` | HACS metadata for the custom integration. |
| `examples/node-red-gate-and-motion.json` | Importable Node-RED flow showing motion events and gateway actions. |
| `.github/workflows/validate.yml` | CI for gateway tests/build, HACS validation, and Home Assistant metadata. |
| `docs/project-memory/README.md` | Short record of the current architecture and delivery state. |

## Gateway app

### Startup and state

| Path | Purpose |
| --- | --- |
| `eufy_event_gateway/src/main.ts` | Wires configuration, storage, provider callbacks, stream management, HTTP server, and shutdown handling. |
| `eufy_event_gateway/src/config.ts` | Reads environment variables, applies safe defaults, and enforces API-token rules for non-loopback listeners. |
| `eufy_event_gateway/src/server.ts` | Exposes the health, camera, snapshot, stream, event, and authentication Web UI endpoints. |
| `eufy_event_gateway/src/domain/types.ts` | Shared TypeScript contracts for cameras, detections, snapshots, streams, and diagnostics. |
| `eufy_event_gateway/src/domain/gateway-state.ts` | In-memory state machine for connection status, camera entities, detections, snapshots, and stream state. |
| `eufy_event_gateway/src/storage/snapshot-store.ts` | Persists one last-good image per camera with hashed filenames and atomic writes. |
| `eufy_event_gateway/src/provider/provider.ts` | Small provider interface used by the real and simulated Eufy backends. |
| `eufy_event_gateway/src/provider/eufy-provider.ts` | Connects Mega, enumerates supported cameras, receives push events, fetches event images, and starts first-party PPCS streams. |
| `eufy_event_gateway/src/provider/simulated-provider.ts` | Deterministic provider for local UI, API, and lifecycle testing without an Eufy account. |

### Mega protocol

| Path | Purpose |
| --- | --- |
| `src/mega/client.ts` | Mega login, session reuse, identity and inventory requests, cipher lookup, and authentication challenge handling. |
| `src/mega/crypto.ts` | Mega key exchange, request signing, envelope encryption, password encryption, and token derivation. |
| `src/mega/types.ts` | Typed responses and persisted session contracts for the Mega API. |
| `src/mega/session-store.ts` | Reads and atomically writes the current Mega session, with one-time migration from the old local shape. |
| `src/mega/push.ts` | Registers Firebase delivery, stores the push receiver state, and normalizes notification payloads into camera events. |
| `src/mega/image.ts` | Decodes Eufy event-image wrappers and recognizes JPEG data. |
| `src/mega/web-client.ts` | Separate Web UI session used only for Eufy's challenge flow and legacy web transport support. |
| `src/mega/web-crypto.ts` | Cryptographic helpers for the Web UI session and WebRTC signalling. |
| `src/mega/web-session-store.ts` | Persists the separate Web UI session. |
| `src/mega/web-types.ts` | Types for Web UI authentication, device data, and signalling responses. |
| `src/mega/native-mqtt.ts` | Native Thing MQTT connection and credential derivation used by the older transport experiments. |
| `src/mega/native-p2p.ts` | Native MQTT/P2P message framing and signalling helpers. |
| `src/mega/native-media.ts` | Native relay encryption, framing, KCP packets, and media extraction helpers. |
| `src/mega/native-relay.ts` | TCP relay connection and handshake implementation for the native transport. |
| `src/mega/native-relay-session.ts` | KCP control/video session over the native relay. |
| `src/mega/thing-gateway.ts` | SmartLife/Thing protocol client kept for isolated transport experiments, not the production Mega path. |

### Video and media

| Path | Purpose |
| --- | --- |
| `src/stream/first-party-ppcs.ts` | First-party Mega/PPCS UDP lookup, HomeBase handshake, media request, H.264 extraction, and frame output. |
| `src/stream/live-stream-manager.ts` | Shares a live source between viewers, feeds FFmpeg snapshot extraction, bounds recordings, and stops idle sessions. |
| `src/stream/jpeg-parser.ts` | Extracts complete JPEG frames from FFmpeg's image pipe. |
| `src/stream/h264-rtp.ts` | Reassembles H.264 NAL units from RTP packets for the WebRTC path. |
| `src/stream/web-rtc-stream.ts` | Web UI WebRTC signalling and media session, retained as a separate transport implementation. |
| `src/stream/native-stream-session.ts` | Coordinates the native MQTT, P2P, relay, and FFmpeg path. |
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
