# Changelog

## 0.1.37

- Add a privacy-safe live PPCS probe for battery-history parameter 3100. Support logs report only bounded JSON field names and structural types, never timestamps, measurements, account data, or device identifiers.

## 0.1.36

- Discover T8010 HomeBase 2 as a read-only Home Assistant device with firmware, inventory availability, and child-camera route readiness, without enabling unverified T8030 controls.
- Log privacy-safe snapshot, clip, and PPCS failure stages with model, route, and bounded transport counters so direct-camera media failures can be diagnosed without device identifiers or packet data.

## 0.1.35

- Clarify that Home Assistant must be fully restarted after updating the integration, and that the HACS integration and app are updated separately.

## 0.1.34

- Attempt each missing startup snapshot only once per gateway run instead of retrying after every inventory refresh.
- Suppress repeated state pulses for two-stage push deliveries while retaining a thumbnail that arrives on the later delivery.

## 0.1.33

- Retry authenticated push-thumbnail downloads after brief HTTP 404 responses while Eufy's cloud object is still becoming available.
- Log successful retained push snapshots explicitly so notification-image recovery can be confirmed from privacy-safe support logs.

## 0.1.32

- Restore the Home Assistant app's displayed release history by backfilling its changelog for versions 0.1.27 through 0.1.31.
- Enforce the current release heading in both the repository and app-facing changelogs as part of the release consistency check.

## 0.1.31

- Authenticate temporary Eufy event-image downloads, follow only the expected object-store redirect without forwarding credentials, and retain attributed thumbnails independently of event classification.
- Add distinct transient sensors for pet, vehicle, dog, crying, sound, stranger, and stranded-package detections from the expanded Eufy push-event vocabulary.
- De-duplicate follow-up notification deliveries and summarize repeated HomeBase refresh failures instead of logging the same warning every minute.

## 0.1.30

- Confirm T8030 writes through fresh readback when an acknowledgement times out, without resending the command; log station-command outcomes and surface safe gateway errors in Home Assistant.

## 0.1.29

- Correct the USB-C-powered T817L classification: suppress its battery-shaped compatibility fields and remove battery entities created by v0.1.28 during upgrade.

## 0.1.28

- Add camera and doorbell battery percentage, charging, health, and temperature entities when the corresponding Mega inventory fields are present.
- Add a normalized standalone-sensor API and Home Assistant devices for supported contact, PIR motion, battery percentage, and last-seen state.
- Route contact open or closed pushes and transient PIR motion pushes into Home Assistant, with a 60-second inventory refresh for persisted readings.
- Keep capability decisions evidence-based: mains-powered camera sentinels do not create battery entities, and standalone sensor entities appear only for reported fields or recognized PIR types.
- Document the Home Assistant integration's module ownership, entity lifecycle, protocol boundaries, and non-obvious state behaviour under the project-wide Python commenting standard.

## 0.1.27

- Log privacy-safe capability groups for cameras, doorbells, HomeBase 3, and standalone sensors. The groups show known-type admission, route readiness, reported core evidence, and which gateway paths can be offered without printing device identifiers or raw values.
- Add authenticated gateway capability endpoints so a discovered device can be compared with the current gateway support paths before Home Assistant entities are considered.
- Use DSK keys fetched during the current inventory pass when deciding whether a camera's media route is ready.
- Unknown camera-like rows are marked for review, not automatically accepted. Battery reads and standalone sensor state remain discovery-only; this release adds no battery or sensor entities to Home Assistant.

## 0.1.26

- Handle snapshot and clip timer rejections as soon as their promises are created. A timeout during slow PPCS startup now reaches the capture or recording caller instead of triggering the process-level unhandled-rejection exit.
- Admit Mega camera types 26 (`T8162`), 47 (`T8425`), 48 (`T8170`), and 10005 (`T81A0`) through an inventoried parent peer with a camera channel, PPCS connection, and DSK key.
- Keep T9000/type 27 out of the camera and managed-station inventories. It remains an eligible PPCS parent for its cameras. Station command behaviour and media on the reported hardware still need testing.

## 0.1.25

- Admit Mega types 94 (`T8214` Video Doorbell E340) and 104 (`T8416` Indoor Cam S350) through their inventoried parent PPCS peers.
- Classify the E340 as a doorbell so its camera state includes the existing press sensor. Press-event routing on this model remains unverified.
- Keep the `T8023` MiniBase Chime outside the camera and HomeBase entity lists; its inventory connection may serve the E340's media path.

## 0.1.24

- Register for camera notifications as the Eufy Android app instead of a Chromium web-push client. The old subscription could connect to Firebase but delivered metadata-only messages.
- Normalize local motion (`3101`), person (`3102`), and T8210 doorbell press (`3103`) payloads from the new Android FCM transport.
- Report delivery and routing with payload-free logs, and include `npm run debug:push` for local checks without Home Assistant or PPCS.
- Persist the Android receiver identity and delivered message IDs so a restart can reconnect without replaying old notifications.

## 0.1.23

- Admit eufyCam S300 / 3C (`T8161`, Mega type 23) as a HomeBase-attached camera. The reporter's inventory had the station, channel, PPCS, and DSK prerequisites, but real-device discovery, events, snapshots, and live video still need confirmation.

## 0.1.22

- Include the merged HomeBase 3 device, alarm, guard-mode, storage, volume, and tone support for the next versioned app update. Hardware confirmation of command framing, storage units and status meanings, writable ranges, and siren stop codes is still required.
- Admit Mega device type 63 (T8134/SoloCam C20) as a camera when its inventory provides the required HomeBase and PPCS prerequisites. Discovery, events, snapshots, and live video still need hardware testing.
- Add the first standalone PPCS route for the Wired Wall Light Cam S100 (`T84A1`, Mega type 151). The gateway now uses an eligible parentless camera's own peer connection and DSK key rather than requiring a HomeBase.
- Log a privacy-safe summary of every normalized push and a payload-free receipt when a push cannot be normalized. Inventory diagnostics also identify HomeBase, direct, and unavailable stream routes without exposing device identity or connection values. S100 discovery, events, snapshots, and live video still need hardware testing.
- Run the app on the host network so local PPCS UDP discovery can reach Eufy devices on the LAN while keeping the gateway API port unmapped by default.
- Correct the HomeBase local-lookup and camera-check PPCS request headers.
- Convert HomeBase storage figures from the device's MiB values to bytes before publishing them to Home Assistant.
- Present HomeBase storage capacity in gigabytes with two-decimal display precision.

## 0.1.21

- Add HomeBase 3 as its own Home Assistant device with model, firmware, inventory availability, and separate PPCS connection diagnostics.
- Add a code-free alarm panel for Away, Home, and Disarmed, plus configured and effective guard-mode entities for Schedule, Geofencing, and Custom 1 through 3.
- Follow guard-mode and siren changes received through Eufy push notifications, with a 60-second PPCS recovery poll that waits while the HomeBase is serving camera media.
- Add read-only eMMC and HDD or SSD capacity, free-space, and device-status sensors.
- Add alarm volume, prompt volume, and alarm tone controls. Every write waits for a device acknowledgement and fresh readback, does not retry automatically, and stops active camera media when a security command needs the HomeBase.

## 0.1.20

- Remove the unused Web Portal/WebRTC, Thing/MQTT, and experimental native-relay code paths and their dependencies.
- Replace the saved session's fast password-derived value with a version 2 `scrypt` credential verifier. The first start after upgrading requires a fresh Eufy sign-in.
- Document why live PPCS sessions still use an ephemeral RSA-1024 key: current cameras return the encrypted video key in a fixed 128-byte protocol field.

## 0.1.19

- Discover T8160/S330, T8410/T8410C, and T8213 cameras from the Mega inventory types reported by affected installations.
- Keep the type 18 HomeBase as parent metadata instead of exposing it as a camera.
- Thanks to @AbeltjeNL for patiently testing the setup and sharing the inventory log that identified the missing device types.

## 0.1.18

- Prefix every gateway support-log line with a UTC timestamp, severity, release version, process run ID, component, and event name.
- Record explicit process start, listening, stop, and fatal-error events so copied logs preserve restart boundaries.
- Report grouped Mega inventory classifications and stream-readiness fields without device names or serial numbers.
- Suppress expected readiness-probe connection noise and redact common credentials and account email addresses from gateway diagnostics.

## 0.1.17

- Show the verification-code field directly in app configuration instead of hiding it behind the optional-field control.
- Capture retained images sequentially for newly discovered cameras that have no snapshot.
- Exit cleanly after Supervisor sends `SIGTERM` instead of reporting the gateway process's signal status as app exit code 143.

## 0.1.16

- Preserve Eufy's limited pre-verification Mega session across the documented app restart so email-code submission retains its required token.
- Submit Web UI email verification through the active Mega client instead of the separate legacy web session.
- Add regression coverage for verification-required login, app restart, and successful code submission.

## 0.1.15

- Add a first-day developer guide covering the repository architecture, Mega authentication, inventory, push events, snapshots, PPCS streaming, and Home Assistant conversion.
- Add a detailed Mega platform and protocol reference with endpoint, payload, encryption, and media-flow documentation.
- Expand file-level TypeScript, Python, probe, and test documentation so maintainers can understand ownership, lifecycle, and protocol boundaries from the source.
- Add direct links to the developer documentation from the public and app READMEs.

## 0.1.14

- Add contributor, security, and repository file-map documentation.
- Document the internal `eufy_event_gateway` compatibility identifiers separately from the Eufy Mega Security branding.
- Expand source comments around the Mega, PPCS, state, storage, and Home Assistant integration boundaries.
- Clarify that a battery camera with no charge can complete the PPCS handshake without producing video.

## 0.1.13

- Rename the project, Home Assistant integration, and HACS repository to Eufy Mega Security.

## 0.1.12

- Add a gateway-owned first-party PPCS camera transport with level-2 key negotiation.
- Prove live H.264 and fresh JPEG snapshots for wired and battery camera classes before Home Assistant integration.
- Remove the obsolete Web Portal PIN and Thing-login stream configuration.

## 0.1.11

- Use the gateway's first-party Mega authentication, inventory, push, and event-image implementations.
- Register camera types 7, 8, and 10031 from the current Mega inventory.
- Migrate an existing authenticated Mega session without retaining the obsolete client dependency.
- Disable unsupported live-stream actions instead of routing them through the retired legacy API.

## 0.1.10

- Use the Mega client's supported device-list request instead of an incompatible low-level payload.

## 0.1.9

- Avoid the legacy device list while operating through an authenticated Mega-only session.

## 0.1.8

- Use an authenticated Mega session for camera discovery and push notifications without requiring the failed legacy login.

## 0.1.7

- Keep CAPTCHA results inside the app web interface and show a fresh challenge when Eufy rejects an answer.

## 0.1.6

- Add an authenticated Home Assistant app web interface for completing Eufy CAPTCHA challenges.

## 0.1.5

- Download and retain event thumbnails for push-only HomeBase 3 cameras.

## 0.1.4

- Keep the app and companion integration release versions aligned.

## 0.1.3

- Keep the app and companion integration release versions aligned.

## 0.1.2

- Keep the app and companion integration release versions aligned.

## 0.1.1

- Include the companion integration's HACS brand asset in the repository release.

## 0.1.0

- Initial event-first gateway release.
- Generated private API authentication and Home Assistant discovery.
- Legacy and Mega device inventory, push detections, retained images, and on-demand P2P video.
- Independent liveness checks that keep authentication-required and temporary-disconnection states observable.
