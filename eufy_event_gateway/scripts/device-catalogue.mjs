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
const deviceExtensions = [".yaml"];
const capabilityGroups = ["readable", "controls", "media", "events"];
const supportStatuses = ["tested", "reported", "mixed", "declared", "failing", "unsupported", "unknown"];
const connectionPattern = /^(?:direct|T[A-Z0-9]+)$/;
const simplifiedCapabilityFields = new Set(["connections", "requires_parameter", "read", "write", "values", "notes", "source"]);
const capabilityConnectionFields = new Set(["status", "tested_on", "tested_by", "notes"]);

function isDeviceFile(file) {
  return deviceExtensions.some((extension) => file.endsWith(extension));
}

function deviceFileStem(file) {
  const extension = deviceExtensions.find((candidate) => file.endsWith(candidate));
  return extension ? basename(file, extension) : basename(file);
}

function parseDevice(_file, source) {
  return parse(source);
}

function deviceModels(record) {
  return record.models;
}

function deviceName(record) {
  return record.name;
}

function deviceAliases(record) {
  return record.aliases ?? [];
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

  if (record.schema !== 1) errors.push(`${file}: schema must be 1`);
  return [...errors, ...validateSimplifiedDevice(file, record)];
}

function validateSimplifiedDevice(file, record) {
  const errors = [];
  const allowedTopLevel = new Set([
    "schema", "id", "name", "category", "aliases", "models", "device_type", "notes", "capabilities", "ignored",
  ]);
  for (const key of Object.keys(record)) {
    if (!allowedTopLevel.has(key)) errors.push(`${file}: unknown top-level field ${key}`);
  }
  if (typeof record.name !== "string" || record.name.length === 0) errors.push(`${file}: missing name`);
  if (record.category !== undefined
    && !["camera", "doorbell", "homebase", "hub_adjacent", "nvr", "smart_lock"].includes(record.category)) {
    errors.push(`${file}: category is invalid`);
  }
  if (record.aliases !== undefined
    && (!Array.isArray(record.aliases)
      || record.aliases.some((alias) => typeof alias !== "string" || alias.length === 0)
      || new Set(record.aliases).size !== record.aliases.length)) {
    errors.push(`${file}: aliases must be a unique array of non-empty names`);
  }
  if (!Array.isArray(record.models) || record.models.some((model) => typeof model !== "string" || model.length === 0)) {
    errors.push(`${file}: models must be an array of model codes`);
  }
  if (record.device_type !== null && !Number.isSafeInteger(record.device_type)) {
    errors.push(`${file}: device_type must be an integer or null`);
  }
  if (record.notes !== undefined && (typeof record.notes !== "string" || record.notes.length === 0)) {
    errors.push(`${file}: notes must be a non-empty string`);
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
      for (const key of Object.keys(capability)) {
        if (!simplifiedCapabilityFields.has(key)) errors.push(`${file}: ${group}.${name} has unknown field ${key}`);
      }
      if (!capability.connections || typeof capability.connections !== "object" || Array.isArray(capability.connections)
        || Object.keys(capability.connections).length === 0) {
        errors.push(`${file}: ${group}.${name} connections must be a non-empty map`);
      } else {
        for (const [connection, result] of Object.entries(capability.connections)) {
          if (!connectionPattern.test(connection)) errors.push(`${file}: ${group}.${name} uses invalid connection ${connection}`);
          if (!result || typeof result !== "object" || Array.isArray(result) || !supportStatuses.includes(result.status)) {
            errors.push(`${file}: ${group}.${name} has invalid result for ${connection}`);
            continue;
          }
          for (const key of Object.keys(result)) {
            if (!capabilityConnectionFields.has(key)) errors.push(`${file}: ${group}.${name}.${connection} has unknown field ${key}`);
          }
          if (result.tested_by !== undefined
            && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(result.tested_by)) {
            errors.push(`${file}: ${group}.${name}.${connection} tested_by must be a GitHub username without @`);
          }
        }
      }
      if (group === "controls" && !capability.write) errors.push(`${file}: controls.${name} must define write`);
      if (group === "readable" && !capability.read) errors.push(`${file}: readable.${name} must define read`);
      if (capability.read) {
        const hasParameter = capability.read.parameter !== undefined;
        const hasField = capability.read.field !== undefined;
        if (hasParameter === hasField) errors.push(`${file}: ${group}.${name} read must define exactly one parameter or field`);
        if (hasParameter && (!Number.isSafeInteger(capability.read.parameter) || capability.read.parameter < 1)) {
          errors.push(`${file}: ${group}.${name} read parameter must be a positive integer`);
        }
        if (hasField && !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(capability.read.field)) {
          errors.push(`${file}: ${group}.${name} read field must use snake case`);
        }
      }
      if (capability.requires_parameter !== undefined
        && (!Number.isSafeInteger(capability.requires_parameter) || capability.requires_parameter < 1)) {
        errors.push(`${file}: ${group}.${name} requires_parameter must be a positive integer`);
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
    ...deviceAliases(record),
    ...(deviceModels(record) ?? []),
  ].some((value) => String(value).toUpperCase() === normalized));
}

function countCapabilities(record) {
  return Object.values(record.capabilities).reduce((sum, entries) => sum + Object.keys(entries).length, 0);
}

function countSelectableValues(record) {
  return Object.values(record.capabilities).reduce(
    (sum, entries) => sum + Object.values(entries).reduce(
      (entrySum, entry) => entrySum + Object.keys(entry.values ?? {}).length,
      0,
    ),
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
    const capabilities = Object.entries(record.capabilities).flatMap(([group, entries]) => {
      const capability = entries[capabilityKey];
      return capability ? [{ group, name: capabilityKey, ...capability }] : [];
    });
    return { file, id: record.id, name: record.name, models: record.models, capabilities };
  });
  console.log(JSON.stringify(output, null, 2));
}

const [command = "check", model, capabilityKey] = process.argv.slice(2);
if (command === "check") await check();
else if (command === "query" && model) await query(model, capabilityKey);
else throw new Error("Usage: device-catalogue.mjs check | query MODEL [CAPABILITY]");
