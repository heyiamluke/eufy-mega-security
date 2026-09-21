/**
 * Validates and queries the contributor-maintained device capability catalogue.
 *
 * The command reads repository data only. Runtime admission remains owned by
 * the provider capability modules, which can adopt catalogue facts explicitly.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const catalogueDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "device_catalogue");
const devicesDirectory = join(catalogueDirectory, "devices");
const forbiddenReferencePattern = /sdk|eufy-security-client|mega-yfue|source_repo|file_line|verified_by|xref_mega|build\/http\/types\.js|src\/model\/|(?:no)?lib[0-9]|\blibrary\b/i;
const legacyIdentifierPattern = /(?:^|[-_])(?:no)?lib(?:[0-9_]|$)/i;
const deviceExtensions = [".json", ".yaml"];
const capabilityGroups = ["readable", "controls", "media", "events"];
const supportStatuses = ["tested", "reported", "declared", "unknown"];

function isDeviceFile(file) {
  return deviceExtensions.some((extension) => file.endsWith(extension));
}

function deviceFileStem(file) {
  const extension = deviceExtensions.find((candidate) => file.endsWith(candidate));
  return extension ? basename(file, extension) : basename(file);
}

function parseDevice(file, source) {
  return file.endsWith(".yaml") ? parse(source) : JSON.parse(source);
}

function deviceModels(record) {
  return record.schema === 1 ? record.models : record.identity?.model_codes;
}

function deviceName(record) {
  return record.schema === 1 ? record.name : record.identity?.display_name;
}

async function loadDevices() {
  const files = (await readdir(devicesDirectory)).filter(isDeviceFile).sort();
  return Promise.all(files.map(async (file) => {
    const source = await readFile(join(devicesDirectory, file), "utf8");
    return { file, source, record: parseDevice(file, source) };
  }));
}

async function validateCatalogueSources() {
  const files = (await readdir(catalogueDirectory, { recursive: true }))
    .filter((file) => isDeviceFile(file) || file.endsWith(".md"));
  const errors = [];
  for (const file of files) {
    const source = await readFile(join(catalogueDirectory, file), "utf8");
    if (forbiddenReferencePattern.test(source)) errors.push(`${file}: contains forbidden reference-source metadata`);
  }
  return errors;
}

function validateDevice(file, source, record, ids) {
  const errors = [];
  const fileStem = deviceFileStem(file);
  if (forbiddenReferencePattern.test(source)) errors.push(`${file}: contains forbidden reference-source metadata`);
  if (legacyIdentifierPattern.test(fileStem)) errors.push(`${file}: contains a legacy source identifier`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fileStem)) errors.push(`${file}: filename must use lowercase kebab case`);
  if (!record || typeof record !== "object" || Array.isArray(record)) return [...errors, `${file}: device record must be a map`];
  if (typeof record.id !== "string" || record.id.length === 0) errors.push(`${file}: missing id`);
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) errors.push(`${file}: id must use lowercase kebab case`);
  else if (ids.has(record.id)) errors.push(`${file}: duplicate id ${record.id}`);
  else ids.add(record.id);

  if (record.schema === 1) return [...errors, ...validateSimplifiedDevice(file, record)];
  if (record.$schema !== "../schema.json") errors.push(`${file}: invalid schema reference`);
  if (!record.identity || typeof record.identity.display_name !== "string") errors.push(`${file}: missing display name`);
  if (!Array.isArray(record.identity?.model_codes)) errors.push(`${file}: model_codes must be an array`);
  if (!record.device_registry || typeof record.device_registry !== "object") errors.push(`${file}: missing device registry`);
  if (!record.capabilities || typeof record.capabilities !== "object") errors.push(`${file}: missing capabilities`);

  for (const [kind, capabilities] of Object.entries(record.capabilities ?? {})) {
    if (!Array.isArray(capabilities)) {
      errors.push(`${file}: ${kind} must be an array`);
      continue;
    }
    const keys = new Set();
    for (const capability of capabilities) {
      const key = `${capability.key}\u0000${capability.context}`;
      if (!capability.key || !capability.context || !capability.available) errors.push(`${file}: incomplete ${kind} capability`);
      if (keys.has(key)) errors.push(`${file}: duplicate ${kind} ${capability.key} (${capability.context})`);
      keys.add(key);
      const optionValues = new Set();
      for (const option of capability.value?.options ?? []) {
        const value = JSON.stringify(option.value);
        if (optionValues.has(value)) errors.push(`${file}: duplicate option ${value} for ${capability.key}`);
        optionValues.add(value);
      }
    }
  }
  return errors;
}

function validateSimplifiedDevice(file, record) {
  const errors = [];
  const allowedTopLevel = new Set(["schema", "id", "name", "models", "device_type", "connections", "capabilities", "ignored"]);
  for (const key of Object.keys(record)) {
    if (!allowedTopLevel.has(key)) errors.push(`${file}: unknown top-level field ${key}`);
  }
  if (typeof record.name !== "string" || record.name.length === 0) errors.push(`${file}: missing name`);
  if (!Array.isArray(record.models) || record.models.some((model) => typeof model !== "string" || model.length === 0)) {
    errors.push(`${file}: models must be an array of model codes`);
  }
  if (record.device_type !== null && !Number.isSafeInteger(record.device_type)) {
    errors.push(`${file}: device_type must be an integer or null`);
  }
  if (!record.connections || typeof record.connections !== "object" || Array.isArray(record.connections)) {
    errors.push(`${file}: connections must be a map`);
  } else {
    for (const [connection, status] of Object.entries(record.connections)) {
      if (!connection || !supportStatuses.includes(status)) errors.push(`${file}: invalid connection ${connection}`);
    }
  }
  if (!record.capabilities || typeof record.capabilities !== "object" || Array.isArray(record.capabilities)) {
    errors.push(`${file}: capabilities must be a map`);
    return errors;
  }
  for (const [group, entries] of Object.entries(record.capabilities)) {
    if (!capabilityGroups.includes(group)) errors.push(`${file}: unknown capability group ${group}`);
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
      errors.push(`${file}: ${group} must be a named map`);
      continue;
    }
    for (const [name, capability] of Object.entries(entries)) {
      if (!capability || typeof capability !== "object" || Array.isArray(capability)) {
        errors.push(`${file}: ${group}.${name} must be a map`);
        continue;
      }
      if (!supportStatuses.includes(capability.status)) errors.push(`${file}: ${group}.${name} has invalid status`);
      if (capability.requires && !(capability.requires in (record.connections ?? {}))) {
        errors.push(`${file}: ${group}.${name} requires unknown connection ${capability.requires}`);
      }
      if (group === "controls" && !capability.write) errors.push(`${file}: controls.${name} must define write`);
      if (group === "readable" && !capability.read) errors.push(`${file}: readable.${name} must define read`);
      if (capability.read?.parameter !== undefined && (!Number.isSafeInteger(capability.read.parameter) || capability.read.parameter < 1)) {
        errors.push(`${file}: ${group}.${name} read parameter must be a positive integer`);
      }
      if (capability.write && (!Number.isSafeInteger(capability.write.command) || capability.write.command < 1)) {
        errors.push(`${file}: ${group}.${name} write command must be a positive integer`);
      }
      const input = capability.write?.input;
      if (input !== undefined) {
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          errors.push(`${file}: ${group}.${name} write input must be a map`);
        } else {
          if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(input.name ?? "")) {
            errors.push(`${file}: ${group}.${name} write input name must use snake case`);
          }
          if (input.type !== "integer") errors.push(`${file}: ${group}.${name} write input type must be integer`);
          if (!Number.isSafeInteger(input.minimum) || !Number.isSafeInteger(input.maximum) || input.minimum > input.maximum) {
            errors.push(`${file}: ${group}.${name} write input must have a valid integer range`);
          }
        }
      }
      if (capability.values !== undefined && (!capability.values || typeof capability.values !== "object" || Array.isArray(capability.values))) {
        errors.push(`${file}: ${group}.${name} values must be a map`);
      }
    }
  }
  if (record.ignored !== undefined && (!record.ignored || typeof record.ignored !== "object" || Array.isArray(record.ignored))) {
    errors.push(`${file}: ignored must be a named map`);
  }
  return errors;
}

function validateIdentityKeys(devices) {
  const errors = [];
  const recordsByPrimaryModel = new Map();
  for (const device of devices) {
    const primaryModel = deviceModels(device.record)?.[0];
    if (!primaryModel) continue;
    const key = String(primaryModel).toLowerCase();
    const records = recordsByPrimaryModel.get(key) ?? [];
    records.push(device);
    recordsByPrimaryModel.set(key, records);
  }
  for (const [primaryModel, records] of recordsByPrimaryModel) {
    for (const { file, record } of records) {
      const fileStem = deviceFileStem(file);
      if (!fileStem.startsWith(`${primaryModel}-`)) {
        errors.push(`${file}: filename must start with primary model ${primaryModel}-`);
      }
      if (records.length === 1 && record.id !== primaryModel) {
        errors.push(`${file}: unique primary model must use id ${primaryModel}`);
      }
      if (records.length > 1 && !record.id.startsWith(`${primaryModel}-`)) {
        errors.push(`${file}: shared primary model id must start with ${primaryModel}-`);
      }
      if (record.schema !== 1 && records.length > 1 && !record.identity.variant_rule) {
        errors.push(`${file}: shared primary model requires a variant rule`);
      }
    }
  }
  for (const { file, record } of devices) {
    if (deviceModels(record)?.length > 0) continue;
    const fileStem = deviceFileStem(file);
    if (fileStem !== record.id && !fileStem.startsWith(`${record.id}-`)) {
      errors.push(`${file}: filename must start with id ${record.id}`);
    }
  }
  return errors;
}

function findDevice(devices, query) {
  const normalized = query.toUpperCase();
  return devices.filter(({ record }) => [
    record.id,
    deviceName(record),
    ...(deviceModels(record) ?? []),
    ...(record.identity?.aliases ?? []),
  ].some((value) => String(value).toUpperCase() === normalized));
}

function countCapabilities(record) {
  if (record.schema === 1) {
    return Object.values(record.capabilities).reduce((sum, entries) => sum + Object.keys(entries).length, 0);
  }
  return Object.values(record.capabilities).reduce((sum, rows) => sum + rows.length, 0);
}

function countSelectableValues(record) {
  if (record.schema === 1) {
    return Object.values(record.capabilities).reduce(
      (sum, entries) => sum + Object.values(entries).reduce(
        (entrySum, entry) => entrySum + Object.keys(entry.values ?? {}).length,
        0,
      ),
      0,
    );
  }
  return Object.values(record.capabilities).reduce(
    (sum, rows) => sum + rows.reduce((rowSum, row) => rowSum + (row.value?.options?.length ?? 0), 0),
    0,
  );
}

async function check() {
  const devices = await loadDevices();
  const ids = new Set();
  const errors = [
    ...await validateCatalogueSources(),
    ...devices.flatMap(({ file, source, record }) => validateDevice(file, source, record, ids)),
    ...validateIdentityKeys(devices),
  ];
  const capabilityCount = devices.reduce(
    (count, { record }) => count + countCapabilities(record),
    0,
  );
  const optionCount = devices.reduce(
    (count, { record }) => count + countSelectableValues(record),
    0,
  );
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  console.log(JSON.stringify({ devices: devices.length, capabilities: capabilityCount, selectableValues: optionCount }));
}

async function query(model, capabilityKey) {
  const matches = findDevice(await loadDevices(), model);
  if (matches.length === 0) throw new Error(`No device matches ${model}`);
  const output = matches.map(({ file, record }) => {
    if (!capabilityKey) return { file, ...record };
    if (record.schema === 1) {
      const capabilities = Object.entries(record.capabilities).flatMap(([group, entries]) => {
        const capability = entries[capabilityKey];
        return capability ? [{ group, name: capabilityKey, ...capability }] : [];
      });
      return { file, id: record.id, name: record.name, models: record.models, capabilities };
    }
    const capabilities = Object.entries(record.capabilities).flatMap(([kind, rows]) => rows
      .filter((row) => row.key.toLowerCase() === capabilityKey.toLowerCase())
      .map((row) => ({ kind, ...row })));
    return { file, id: record.id, identity: record.identity, capabilities };
  });
  console.log(JSON.stringify(output, null, 2));
}

const [command = "check", model, capabilityKey] = process.argv.slice(2);
if (command === "check") await check();
else if (command === "query" && model) await query(model, capabilityKey);
else throw new Error("Usage: device-catalogue.mjs check | query MODEL [CAPABILITY]");
