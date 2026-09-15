# Changelog

## 0.1.25

- Recognize the Video Doorbell E340 (`T8214`, Mega type 94) and Indoor Cam S350 (`T8416`, type 104) as camera entities through their inventoried parent connections.
- Give the E340 the existing Doorbell press sensor. A press event from this model still needs real-device confirmation.
- List the MiniBase Chime (`T8023`) as recognized connection metadata for the E340. The integration does not create a chime entity or controls.
- Device discovery, push events, snapshots, and live video for the E340 and S350 still need hardware testing.

## 0.1.24

- Register for camera notifications as the Eufy Android app. The previous Chromium web-push subscription could connect to Firebase while receiving only metadata instead of motion, person, and doorbell events.
- Route a doorbell press (`3103`) to a new Doorbell binary sensor on supported doorbells. The sensor stays on for 10 seconds after a press.
- Add a local push probe and payload-free delivery logs to help diagnose notifications without restarting Home Assistant or printing account data.
- Confirm motion (`3101`), person (`3102`), and T8210 doorbell press (`3103`) payloads on local cameras. Other Eufy event types and HomeBase 2 live streaming need separate testing.

## 0.1.23

- Admit eufyCam S300 / 3C (`T8161`, Mega type 23) as a HomeBase-attached camera. The reporter's inventory had the station, channel, PPCS, and DSK prerequisites, but real-device discovery, events, snapshots, and live video still need confirmation.

## 0.1.22

- Include the merged HomeBase 3 device, alarm, guard-mode, storage, volume, and tone support for the next versioned app update. Hardware confirmation of command framing, storage units and status meanings, writable ranges, and siren stop codes is still required.
- Admit Mega device type 63 (T8134/SoloCam C20) as a camera when its inventory provides the required HomeBase and PPCS prerequisites. Discovery, events, snapshots, and live video still need hardware testing.
- Add the first standalone PPCS route for the Wired Wall Light Cam S100 (`T84A1`, Mega type 151). The gateway now uses an eligible parentless camera's own peer connection and DSK key rather than requiring a HomeBase.
- Log a privacy-safe summary of every normalized push and a payload-free receipt when a push cannot be normalized. Inventory diagnostics also identify HomeBase, direct, and unavailable stream routes without exposing device identity or connection values. S100 discovery, events, snapshots, and live video still need hardware testing.
- Run the Home Assistant app on the host network so local PPCS UDP discovery can reach Eufy devices on the LAN while keeping the gateway API port unmapped by default.
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

- Add the gateway-owned first-party PPCS transport for live H.264 streams and fresh camera snapshots.
- Discover and use Eufy's DSK and ECC cipher APIs without the Web Portal PIN, SmartLife/Thing login, or `eufy-security-client`.
- Validate the transport against wired T8210 and battery T817L cameras before exposing the Home Assistant live entities.

## 0.1.11

- Replace the obsolete Eufy login and device client with the gateway's own Mega API implementation.
- Discover HomeBase 3 battery cameras, video doorbells, and T817L cameras directly from Mega inventory.
- Register and normalize current Eufy push notifications without the `eufy-security-client` runtime dependency.
- Decode and retain event snapshots using the gateway's own image decoder.
- Reuse an existing authenticated Mega session during the one-time upgrade, avoiding unnecessary CAPTCHA authentication.
- Add a first-party client for Eufy's current web authentication and WebRTC signalling services.
- Restore on-demand live viewing, fresh snapshots, and clip recording for the discovered cameras without `eufy-security-client`.
- Persist the separate web session and handle its CAPTCHA or email verification prompt inside the app Web UI.

## 0.1.10

- Fetch the complete Mega camera inventory using the current API's supported device-list request.

## 0.1.9

- Load Mega camera inventory directly when the legacy Eufy service is unavailable.

## 0.1.8

- Continue through Eufy's current API when its obsolete legacy login requests CAPTCHA after Mega authentication has already succeeded.

## 0.1.7

- Keep CAPTCHA results inside the app web interface and show a fresh challenge when Eufy rejects an answer.

## 0.1.6

- Add a Home Assistant app web interface for completing Eufy CAPTCHA challenges during first sign-in.

## 0.1.5

- Show retained event thumbnails for push-only cameras discovered through HomeBase 3.

## 0.1.4

- Remove internal development notes from the public release.

## 0.1.3

- Use a HACS-compatible static MIT licence badge.

## 0.1.2

- Fix the project icon in HACS's rendered README.
- Add one-click HACS installation and licence badges.

## 0.1.1

- Add the local integration brand icon required by HACS.
- Publish a versioned update to validate the HACS upgrade path.

## 0.1.0

- Initial public hardware-validation release.
- Event-first Eufy camera gateway with legacy and Mega inventory discovery.
- Home Assistant camera, motion, person, and familiar-person entities.
- On-demand battery-camera live streams with retained idle images.
- Fresh-snapshot and timed-recording actions for automations and Node-RED.
- Home Assistant OS app with generated private API authentication and Supervisor discovery.
- Separate process-liveness and Eufy-connection health checks so authentication prompts do not cause app restart loops.
