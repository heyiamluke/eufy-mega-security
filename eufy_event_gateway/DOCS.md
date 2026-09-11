# Eufy Event Gateway

This app runs the local Eufy gateway beside Home Assistant. It receives Eufy and HomeBase events continuously, retains the last useful camera image, and wakes supported battery cameras only while Home Assistant is viewing them or while a fresh snapshot or timed recording is requested.

## Configuration

- **Username**: the dedicated guest Eufy account shared with the required cameras.
- **Password**: that account's Eufy password.
- **Country**: the two-letter Eufy account country, such as `AU`.
- **Verification code**: leave this empty unless the log says Eufy requires an emailed code. Enter the code, restart once, then remove it after the app connects.

The app generates its own API token on first start and sends the private connection details to the integration through Supervisor discovery. The gateway port is not exposed to the LAN and no token needs to be copied or entered manually.

The app stores its authenticated Eufy session and retained snapshots in its private `/data` volume so they survive restarts and are included in Home Assistant backups.

After the app starts, open **Settings > Devices & services**. Home Assistant should show a discovered **Eufy Event Gateway** integration. Select **Configure** to create its camera and detection entities.

The companion integration exposes `capture_snapshot` and `record_clip` actions. Recordings can be 1 to 120 seconds long and are returned as MP4 files; Home Assistant saves a completed file only after the gateway has finished packaging it.
