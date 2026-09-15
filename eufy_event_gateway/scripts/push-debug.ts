/**
 * Runs the production Mega/Firebase push path without Home Assistant or PPCS.
 *
 * This local probe owns a separate account and receiver state directory, uses
 * the gateway's real normalization and safe logging, and stays alive until
 * interrupted. It never prints credentials, device names, serials, tokens, or
 * notification contents. The operator owns the account credentials supplied
 * through environment variables and triggers camera events separately.
 */
import { join, resolve } from "node:path";

import { createLogger } from "../src/logging.js";
import { MegaClient } from "../src/mega/client.js";
import { MegaPushReceiver } from "../src/mega/push.js";
import { inventoryLogSummaries, parseMegaInventory, safePushLogSummary } from "../src/provider/eufy-provider.js";

const logger = createLogger("push_debug");
const username = process.env.EUFY_USERNAME ?? process.env.EUFY_USER;
const password = process.env.EUFY_PASSWORD;
if (!username || !password) throw new Error("EUFY_USERNAME (or EUFY_USER) and EUFY_PASSWORD are required");

const directory = resolve(process.env.EUFY_PUSH_DEBUG_DATA_DIR ?? "./data/push-debug");
const client = new MegaClient({
  email: username,
  password,
  country: process.env.EUFY_COUNTRY ?? "AU",
  persistentDirectory: directory,
});

logger.info("debug_start", "Local push probe starting with isolated private state");
const auth = await client.connect(process.env.EUFY_VERIFY_CODE);
if (auth.state !== "authenticated") {
  logger.warn("debug_auth_required", `Mega authentication needs ${auth.state}; set EUFY_VERIFY_CODE if email verification was requested`);
  process.exit(2);
}

const inventory = parseMegaInventory(await client.inventory());
const devices = new Map(inventory.map((device) => [device.serial, device]));
logger.info("debug_inventory_loaded", `Mega inventory loaded: devices=${devices.size}`);
for (const group of inventoryLogSummaries(inventory, new Set())) {
  logger.info(
    "debug_inventory_group",
    `count=${group.count} model=${JSON.stringify(group.model)} device_type=${group.deviceType ?? "missing"} accepted=${group.acceptedAsCamera}`,
  );
}

let notifications = 0;
const receiver = new MegaPushReceiver(client, join(directory, "mega-push.json"), (event) => {
  notifications += 1;
  logger.info(
    "debug_notification",
    `count=${notifications} ${safePushLogSummary(event, devices.get(event.cameraSerial) ?? null, devices.has(event.stationSerial), false)}`,
  );
});
await receiver.start();
logger.info("debug_ready", "Trigger motion, person detection, or a doorbell ring; each received notification will be counted");

const stop = async (signal: string): Promise<void> => {
  logger.info("debug_stop", `Local push probe stopping: ${signal}; notifications=${notifications}`);
  await receiver.close();
  process.exit(0);
};
process.once("SIGINT", () => void stop("sigint"));
process.once("SIGTERM", () => void stop("sigterm"));
