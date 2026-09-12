# Eufy Mega Security

The gateway app is the event and video engine for the Eufy Mega Security Home Assistant integration.

It signs in through Eufy's current Mega service, receives Eufy/HomeBase detections, retains the last useful event image, and starts live video on demand through the gateway-owned Mega/PPCS transport. The gateway's Eufy account, event, and camera protocol paths are implemented directly and do not depend on the legacy client, SmartLife/Thing login, or Web Portal Access PIN. It generates a private API token automatically and announces its connection details to Home Assistant through Supervisor discovery; its API port is not exposed to the LAN by default.

Install the companion `eufy_event_gateway` custom integration before starting this app. Configure a dedicated Eufy guest account shared with the required cameras, then start the app and accept the discovered integration under **Settings > Devices & services**.

See the [project README](https://github.com/mscodemonkey/eufy-mega-security) for complete HACS, app, automation, Node-RED, and troubleshooting instructions. Developers should start with the repository's [first-day developer guide](../docs/DEVELOPERS_START_HERE.md), then read the [Mega platform reference](../docs/MEGA_PLATFORM.md) before changing the Mega or PPCS paths.
