/**
 * Runs a gateway-independent proof of the first-party Mega/PPCS media path.
 *
 * The probe restores or creates a Mega session, enumerates supported cameras,
 * retrieves station keys, starts one bounded PPCS session per camera, and
 * writes raw Annex-B H.264 plus a first JPEG frame to a local output folder.
 * Its JSON diagnostics are deliberately safe for sharing. This is a developer
 * tool, not a second gateway runtime and not an automated test: real account
 * credentials and camera power/network state are required.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { MegaClient } from "../src/mega/client.js";
import { parseMegaInventory, isSupportedMegaCamera } from "../src/provider/eufy-provider.js";
import { FirstPartyPpcsSession } from "../src/stream/first-party-ppcs.js";

const username = process.env.EUFY_USERNAME;
const password = process.env.EUFY_PASSWORD;
const dataDirectory = process.env.EUFY_GATEWAY_DATA_DIR ?? "./data";
const outputDirectory = process.env.EUFY_PPCS_OUTPUT_DIR ?? "./poc-output";
const waitSeconds = Number(process.env.EUFY_PPCS_WAIT_SECONDS ?? 25);
if (!username || !password) throw new Error("EUFY_USERNAME and EUFY_PASSWORD are required (values are never printed)");

const client = new MegaClient({ email: username, password, country: process.env.EUFY_COUNTRY ?? "AU", persistentDirectory: dataDirectory });
let auth = await client.connect();
if (auth.state !== "authenticated") throw new Error(`Mega authentication is ${auth.state}; complete authentication in the gateway first`);
let inventory;
try {
  inventory = await client.inventory();
} catch (error) {
  if (!client.isSessionInvalidError(error)) throw error;
  auth = await client.connect(undefined, undefined, true);
  if (auth.state !== "authenticated") throw new Error(`Mega re-authentication is ${auth.state}; complete authentication in the gateway first`);
  inventory = await client.inventory();
}
const devices = parseMegaInventory(inventory);
const stations = new Map(devices.filter((device) => !device.parentSerial).map((device) => [device.serial, device]));
const keys = await client.dskKeys([...stations.keys()]);
const cipherKeys = new Map<number, string>();
await mkdir(outputDirectory, { recursive: true });

for (const camera of devices.filter(isSupportedMegaCamera).filter((device) => !process.env.EUFY_PPCS_SERIAL || device.serial === process.env.EUFY_PPCS_SERIAL)) {
  const station = stations.get(camera.parentSerial);
  const key = station ? keys[station.serial] : undefined;
  const result = { serial: camera.serial, model: camera.model, snapshotBytes: 0, streamBytes: 0, jpegBytes: 0, error: null as string | null };
  if (!station?.p2pDid || !station.p2pConnection || !key || camera.channel === null) {
    result.error = "missing station PPCS identity, connection, DSK key, or camera channel";
    console.log(JSON.stringify(result));
    continue;
  }
  try {
    const session = new FirstPartyPpcsSession({ stationSerial: station.serial, p2pDid: station.p2pDid, appConnection: station.p2pConnection, dskKey: key.key, channel: camera.channel, cameraModel: camera.model, accountId: camera.adminUserId, homeBaseAttached: Boolean(camera.parentSerial), resolveCipherKey: async (cipherId) => {
      const cached = cipherKeys.get(cipherId); if (cached) return cached;
      if (!station.adminUserId) return undefined;
      let ciphers;
      try {
        ciphers = await client.getCiphers([cipherId], station.adminUserId, station.serial);
      } catch (error) {
        if (!client.isSessionInvalidError(error)) throw error;
        const auth = await client.connect(undefined, undefined, true);
        if (auth.state !== "authenticated") throw new Error(`Mega re-authentication is ${auth.state}`);
        ciphers = await client.getCiphers([cipherId], station.adminUserId, station.serial);
      }
      for (const cipher of ciphers) {
        const id = typeof cipher.cipher_id === "number" ? cipher.cipher_id : Number(cipher.cipher_id);
        if (Number.isInteger(id) && typeof cipher.ecc_private_key === "string") cipherKeys.set(id, cipher.ecc_private_key);
      }
      if (ciphers.length === 0) console.warn(`cipher response contained no entries for id ${cipherId}`);
      return cipherKeys.get(cipherId);
    }, maxSeconds: waitSeconds + 10 });
    const chunks: Buffer[] = [];
    session.output.on("data", (chunk: Buffer) => chunks.push(chunk));
    await session.start();
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1_000));
    session.close();
    const stream = Buffer.concat(chunks);
    result.streamBytes = stream.length;
    if (stream.length === 0) result.error = `connected but no video bytes (${JSON.stringify(session.stats)})`;
    if (stream.length > 0) {
      const h264Path = join(outputDirectory, `${camera.serial}.h264`);
      await writeFile(h264Path, stream);
      result.jpegBytes = await convertFirstFrame(h264Path, join(outputDirectory, `${camera.serial}.jpg`));
      result.snapshotBytes = result.jpegBytes;
      if (result.jpegBytes === 0) result.error = `received H.264 but no decodable keyframe (${JSON.stringify(session.stats)})`;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  console.log(JSON.stringify(result));
}

async function convertFirstFrame(input: string, output: string): Promise<number> {
  return await new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", input, "-frames:v", "1", "-f", "image2", output]);
    ffmpeg.once("error", () => resolve(0));
    ffmpeg.once("close", async (code) => { if (code !== 0) return resolve(0); try { const { stat } = await import("node:fs/promises"); resolve((await stat(output)).size); } catch { resolve(0); } });
  });
}
