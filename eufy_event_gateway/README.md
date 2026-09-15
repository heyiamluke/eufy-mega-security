# Eufy Mega Security

The gateway app is the event and video engine for the Eufy Mega Security Home Assistant integration.

It signs in through Eufy's current Mega service, receives Eufy/HomeBase detections, retains the last useful event image, and starts live video on demand through the gateway-owned Mega/PPCS transport. It also supplies HomeBase 3 guard mode, alarm state, storage diagnostics, volume, and tone to the companion integration. The gateway's Eufy account, event, camera, and HomeBase protocol paths are implemented directly and do not depend on the legacy client, SmartLife/Thing login, or Web Portal Access PIN. It generates a private API token automatically and announces its connection details to Home Assistant through Supervisor discovery; its API port is not exposed to the LAN by default. The app uses Home Assistant's host network so local PPCS UDP broadcasts can reach Eufy devices on the LAN.

Install the companion `eufy_event_gateway` custom integration before starting this app. Configure a dedicated Eufy guest account shared with the required cameras, then start the app and accept the discovered integration under **Settings > Devices & services**.

See the [project README](https://github.com/mscodemonkey/eufy-mega-security) for complete HACS, app, automation, Node-RED, and troubleshooting instructions. Developers should start with the repository's [first-day developer guide](../docs/DEVELOPERS_START_HERE.md), then read the [Mega platform reference](../docs/MEGA_PLATFORM.md) before changing the Mega or PPCS paths.

# Local push debugging

Run `npm run debug:push` from this directory with `EUFY_USERNAME` (or
`EUFY_USER`) and `EUFY_PASSWORD` in the environment. Optional settings are
`EUFY_COUNTRY`, `EUFY_VERIFY_CODE`, and `EUFY_PUSH_DEBUG_DATA_DIR`. The probe
stores its own Mega and Android FCM identity under `./data/push-debug`, outside
the Home Assistant app, and does not start a camera stream or HomeBase poll.

Wait for `debug_ready`, then trigger motion, person detection, or a doorbell
ring. `debug_notification` counts normalized deliveries. `push_received`
records every Android FCM delivery without showing its payload; `push_unparsed`
records one with data but no usable device identity, and `push_empty` records
one without Eufy fields. Receiver-ready and token-registration lines identify
earlier breaks in delivery.
The probe logs only model and numeric routing fields, never credentials,
serials, names, payloads, or media URLs. Stop it with Ctrl-C.
