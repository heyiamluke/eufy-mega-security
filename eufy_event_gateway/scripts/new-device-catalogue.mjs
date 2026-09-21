/**
 * Creates a minimal contributor-friendly YAML device record.
 *
 * The script owns only the new file creation. Catalogue validation remains in
 * device-catalogue.mjs, which consumes the generated record during checks.
 */

import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const catalogueDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "device_catalogue");
const devicesDirectory = join(catalogueDirectory, "devices");

function parseRecord(file, source) {
  return file.endsWith(".yaml") ? parse(source) : JSON.parse(source);
}

function slug(value) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function modelAlreadyExists(model) {
  const normalized = model.toUpperCase();
  const files = (await readdir(devicesDirectory)).filter((file) => file.endsWith(".json") || file.endsWith(".yaml"));
  for (const file of files) {
    const source = await readFile(join(devicesDirectory, file), "utf8");
    const record = parseRecord(file, source);
    const models = record.schema === 1 ? record.models : record.identity?.model_codes;
    if (models?.some((candidate) => String(candidate).toUpperCase() === normalized)) return file;
  }
  return null;
}

const [modelInput, name] = process.argv.slice(2);
if (!modelInput || !name) throw new Error('Usage: npm run catalogue:new -- MODEL "Display name"');
const model = modelInput.toUpperCase();
if (!/^[A-Z0-9-]+$/.test(model)) throw new Error("Model must contain only letters, numbers, and hyphens");
const existing = await modelAlreadyExists(model);
if (existing) throw new Error(`${model} already exists in ${existing}`);
const id = model.toLowerCase();
const nameSlug = slug(name).split("-").filter((part) => part !== id).join("-");
const filename = `${id}-${nameSlug || "device"}.yaml`;
const target = join(devicesDirectory, filename);
try {
  await access(target);
  throw new Error(`${filename} already exists`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const record = {
  schema: 1,
  id,
  name,
  models: [model],
  device_type: null,
  capabilities: {},
};
await writeFile(target, `# yaml-language-server: $schema=../device.schema.json\n\n${stringify(record)}`);
console.log(join("device_catalogue", "devices", filename));
