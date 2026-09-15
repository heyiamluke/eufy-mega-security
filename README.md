# Eufy Mega Security for Home Assistant

The project is maintained as an open-source gateway and Home Assistant integration. Start with the [developers start here guide](docs/DEVELOPERS_START_HERE.md) if you are new to the codebase, then use the [Mega platform reference](docs/MEGA_PLATFORM.md) for protocol and data-flow detail. The [contributor guide](CONTRIBUTING.md) covers local setup, testing, protocol boundaries, and release rules. The [file map](docs/FILE_MAP.md) explains where each part lives, and [SECURITY.md](SECURITY.md) covers private reports and secret handling.

[![My Home Assistant](https://img.shields.io/badge/Home%20Assistant-%2341BDF5.svg?style=flat&logo=home-assistant&label=My)](https://my.home-assistant.io/redirect/hacs_repository/?owner=mscodemonkey&repository=eufy-mega-security&category=integration)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue.svg)](https://github.com/mscodemonkey/eufy-mega-security/blob/main/LICENSE)

<p align="center">
  <img src="https://raw.githubusercontent.com/mscodemonkey/eufy-mega-security/main/custom_components/eufy_event_gateway/brand/icon.png" width="128" height="128" alt="Eufy Mega Security icon">
</p>

Reliable, event-first Home Assistant support for Eufy cameras that do not provide a permanent RTSP stream.

Motion and person detections arrive as Home Assistant entities, HomeBase 3 familiar-person names are exposed when Eufy actually supplies one, and the last good event image remains visible while the camera is idle.

> [!IMPORTANT]
> This is an early community project built against real EufyCam 2C, HomeBase 3, and Doorbell hardware. It is not affiliated with Anker or Eufy and should not be your only security system.

## Device support

Green ticks mark behaviour tested on real hardware. Amber marks features we have developed but still need to verify. A tick does not mean every feature of a device is supported.

### HomeBase

- ✅ HomeBase 3 S380 / T8030: a community tester confirmed it as the parent of a working camera setup. Its new alarm and settings controls are still awaiting hardware tests.
- 🟠 HomeBase 3 S380 / T8030 controls: the integration adds an alarm panel, configured and effective guard modes, siren state, connection and storage diagnostics, volume controls, and alarm tone. The command path, storage units and status meanings, writable ranges, and siren stop codes still need real-device confirmation before release.
- HomeBase 2: I do not have one to test against right now. Support matters, but I want to verify it myself before asking anyone else to test it.

### Cameras

- ✅ EufyCam 2C: camera support tested by the project maintainer.
- ✅ Battery camera T817L: live streams and snapshots produced on real hardware.
- ✅ eufyCam S330 (Mega model T8160): discovered with sensors, retained images, and live streaming through HomeBase 3.
- 🟠 SoloCam C20 (Mega model T8134): device type 63 now passes camera discovery. Its events, snapshots, and live stream still need confirmation on real hardware.
- ✅ Indoor Cam Pan & Tilt T8410: discovered with sensors, a retained image, and a live stream through HomeBase 3.
- ✅ Indoor Cam Pan & Tilt T8410C: discovered with sensors, a retained image, and a live stream through HomeBase 3.

### Doorbells

- ✅ Video Doorbell T8210: live streams and snapshots produced on real hardware.
- ✅ Video Doorbell T8213: discovered with sensors, retained images, and a live stream through HomeBase 3.

If a tested device behaves differently for you, [open an issue](https://github.com/mscodemonkey/eufy-mega-security/issues) with its model number and what happened. Do not post serial numbers, credentials, or verification codes.

## What it provides

For every discovered camera, the integration creates:

- a camera entity with a retained event image;
- a motion binary sensor;
- a person binary sensor;
- a last-recognized-person sensor, including the detection type and timestamp.

The integration also defines two Home Assistant actions for on-demand streaming:

- `eufy_event_gateway.capture_snapshot` requests a fresh frame from a camera with a supported live transport;
- `eufy_event_gateway.record_clip` records from a camera with a supported live transport.

Live viewing uses the gateway-owned Eufy Mega/PPCS transport. The gateway does not use `eufy-security-client`, the separate SmartLife/Thing login, or an expiring Web Portal Access PIN. The transport has produced real stream and snapshot bytes from both a wired T8210 and battery T817L, and v0.1.14 exposes it through the Home Assistant camera entities.

The actions work in Home Assistant automations and through Node-RED's Home Assistant Action node. An importable example is included in [`examples/node-red-gate-and-motion.json`](examples/node-red-gate-and-motion.json).

## How it fits together

This repository contains two parts, and Home Assistant needs both:

1. **Eufy Mega Security app.** It signs in through Eufy's current Mega service, receives push/HomeBase events, and retains snapshots.
2. **Eufy Mega Security integration.** It turns the gateway data into normal Home Assistant camera, binary-sensor, and sensor entities.

The integration's internal Home Assistant domain remains `eufy_event_gateway` so existing entity IDs and action names keep working. The user-facing name is Eufy Mega Security.

On Home Assistant OS or Supervised, the app generates its own private API token and passes it directly to the integration through Supervisor discovery. The gateway port is closed to the LAN by default.

## Before installing

Create a separate Eufy guest account and share only the Home and cameras you want Home Assistant to access. Do not use the Eufy account currently signed into your everyday mobile app; simultaneous Eufy sessions can interfere with one another.

You will need:

- Home Assistant OS or Home Assistant Supervised for the app installation below;
- HACS, or File Editor/SSH for the manual integration method;
- the guest account username, password, and two-letter account country code;
- the Eufy account credentials; the gateway does not use the expiring Web Portal Access PIN.

## Install the integration with HACS

The project does not need to be accepted into HACS's default catalogue. Add it as a custom repository:

1. Open **HACS** in Home Assistant.
2. Open the three-dot menu and choose **Custom repositories**.
3. Enter `https://github.com/mscodemonkey/eufy-mega-security`.
4. Select **Integration** as the category and add it.
5. Find **Eufy Mega Security**, choose **Download**, and restart Home Assistant.

If you do not use HACS, copy `custom_components/eufy_event_gateway` into `/config/custom_components/eufy_event_gateway` and restart Home Assistant.

## Install the Home Assistant app

1. Open **Settings > Apps > App Store**.
2. Open the repository manager from the top-right menu.
3. Add `https://github.com/mscodemonkey/eufy-mega-security`.
4. Find **Eufy Mega Security** under the new repository and select **Install**.
5. On its **Configuration** tab, enter the dedicated Eufy guest username, password, and country code.
6. Start the app and enable **Start on boot** and **Watchdog**.

Mega events and the native camera transport use the gateway's Mega session. If Eufy requests a CAPTCHA or sends a six-digit email code, open the app's **Web UI** and complete the prompt there without restarting the app. The gateway stores the resulting Mega session so routine app upgrades and restarts do not repeat authentication.

As a fallback for email verification, enter the temporary code in **Verification code** and restart the app once. The gateway retains Eufy's limited pre-verification session across that restart, so the code is submitted with the token that requested it. Remove the code after the app connects. Web UI challenge answers and codes are kept in memory only; the configuration fallback keeps the code in the app's private options until you remove it. Never post credentials, verification codes, or app logs containing private account details in a GitHub issue.

On first discovery, the gateway captures one live snapshot from each camera that has no retained image. Cameras are warmed one at a time, and a sleeping or unavailable camera does not prevent the remaining cameras from starting. Later restarts reuse retained images instead of waking every camera again.

## Connect it to Home Assistant

After the app connects:

1. Open **Settings > Devices & services**.
2. A discovered **Eufy Mega Security** card should appear.
3. Select **Configure** and submit the confirmation.

The app address and generated API token are transferred privately. You do not need to copy either value.

If discovery does not appear, first confirm the app log reports a healthy gateway. Then choose **Add integration**, search for **Eufy Mega Security**, and use the manual gateway details only if you deliberately exposed a standalone gateway.

## Support logs

Gateway log lines begin with a UTC timestamp and identify the running release, process invocation, component, and event. For example:

```text
2026-09-15T04:32:08.417Z INFO version=0.1.18 run=7f31c2ab component=provider event=connection_connected Eufy connection connected
```

The `run` value changes whenever the app process starts. It separates restarts that use the same release, while `version` distinguishes current failures from messages retained from an older app image. Inventory logs group devices by model and classification without device names or serial numbers.

New `push_received` lines show the camera model, event codes, whether the gateway recognizes the device, and how it handled the notification. `push_unparsed` means Firebase delivered a notification that the gateway could not associate with an Eufy device. Neither line includes names, serial numbers, notification text, or image URLs.

When requesting support, copy the complete log from the most recent `gateway_start` event through the failure instead of selecting only the final error. The gateway redacts common credential fields and account email addresses, but review logs before posting them publicly.

## Automations and Node-RED

Motion and person detections are ordinary Home Assistant binary sensors, so they appear directly in Node-RED's **Events: state** node. Snapshot and recording requests are ordinary Home Assistant actions, so use an **Action** node with one of:

```text
eufy_event_gateway.capture_snapshot
eufy_event_gateway.record_clip
```

Both actions target the camera entity. Example recording data:

```json
{
  "filename": "/media/eufy/gate_latest.mp4",
  "duration": 15
}
```

Create the target directory first and ensure the path is allowed by Home Assistant. The importable example uses JSONata to add a timestamp to each filename. Import [`examples/node-red-gate-and-motion.json`](examples/node-red-gate-and-motion.json), select your Home Assistant server, replace the example entity IDs, and deploy it.

Recordings are assembled by the gateway with a hard stream-start timeout and duration limit, then written atomically by Home Assistant. A failed request therefore cannot leave a partial MP4 at the requested filename.

## Camera behaviour

- Motion and person notifications update their Home Assistant sensors without waking a stream.
- The last valid event image remains visible while the camera sleeps.
- Opening a camera starts its native PPCS session on demand and stops it after the configured limit, once that camera has passed the gateway proof.
- A familiar-person name appears only when HomeBase supplies an explicit identity. Generic detections such as `Someone` remain unknown.
- Powered cameras with their own RTSP feed can continue using that feed for video while this integration supplies Eufy/HomeBase detection entities.

## Standalone gateway

### Gateway-only stream proof

Before enabling Home Assistant live entities, run `npm run poc:ppcs` from `eufy_event_gateway` with the gateway's existing data directory and credentials available as environment variables. The probe prints one safe JSON result per discovered camera and writes raw `.h264` plus first-frame `.jpg` files to `EUFY_PPCS_OUTPUT_DIR` (default `./poc-output`). A camera only counts as working when both byte counts are non-zero.

Home Assistant Container/Core users can run the gateway separately with Node.js 24 and FFmpeg. From `eufy_event_gateway`:

```sh
npm ci
npm run build
EUFY_USERNAME='guest@example.com' \
EUFY_PASSWORD='your-password' \
EUFY_COUNTRY='AU' \
EUFY_GATEWAY_API_TOKEN='use-a-random-secret-of-at-least-32-characters' \
EUFY_GATEWAY_HOST='0.0.0.0' \
npm start
```

Keep credentials outside source control. A non-loopback gateway refuses to start without a bearer token of at least 32 characters. Add the integration manually using the reachable gateway URL and the same token.

For development without a Eufy account:

```sh
cd eufy_event_gateway
npm ci
EUFY_GATEWAY_PROVIDER=simulated npm run dev
```

## Supported and known limitations

See [device support](#device-support) for the tested setups and features still awaiting hardware confirmation. HomeBase 3 has its own device in v0.1.21 rather than appearing as a camera.

- Eufy's cloud, push, and HomeBase protocols are undocumented and can change without notice.
- Familiar-person names depend on HomeBase recognition and are not present in every Eufy event.
- Live video uses Eufy's native camera transport. Eufy may require account verification the first time that session is created.
- The app handles authentication challenges in its Web UI, then reuses the valid Mega session across upgrades and restarts.
- The app currently publishes source builds for `amd64` and `aarch64`; installation may take several minutes.

## Privacy and security

- Eufy credentials, sessions, generated API tokens, and snapshots stay in the app's private persistent data volume.
- The app's API port is not exposed to the LAN by default.
- Local PPCS discovery requires the app to use Home Assistant's host network so UDP broadcasts can reach Eufy devices on the LAN.
- Process liveness is checked separately from Eufy connectivity, so an email-code prompt or temporary Eufy outage does not create a restart loop.
- API, snapshot, and event endpoints require authentication when the gateway is remotely reachable.
- Diagnostics intentionally exclude passwords, access tokens, signing keys, notification text, media URLs, and raw payloads.

## Development

```sh
cd eufy_event_gateway
npm ci
npm run check
npm run build
docker build -t eufy-mega-security:test .
```

## Licence

[MIT](LICENSE)
