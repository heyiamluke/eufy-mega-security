# Device capability catalogue

This is the contributor-editable source for what the integration can read,
control, stream, and receive from each device. It deliberately excludes
marketing specifications and general product observations.

New and migrated device records use YAML. The remaining JSON files use the
older detailed format and will be migrated carefully as their data is reviewed.
Both formats are validated and queryable during that transition.

Each filename combines the primary model code and readable display name, such
as `t8170-solocam-s340.yaml`. The `id` stays minimal and stable, so that record
uses `t8170`. Add the shortest meaningful ID suffix only when distinct records
share a model code, such as `t8200-standard` and `t8200-variant-6`. Use a stable
product slug when no model code is confirmed. Source-specific identifiers do
not belong in filenames or IDs.

## Capability groups

- `readable` contains values the integration can read but cannot change.
- `controls` contains settings or actions the integration can change. Put
  readable state for the same control in its `read` block.
- `media` contains live view, snapshots, and recordings.
- `events` contains motion, person, doorbell, sound, and similar events.

Omit groups that have no known entries. Use `ignored` only when a device reports
misleading values that the integration must deliberately suppress.

Always quote human-facing labels under `values`. This keeps formatting
consistent and prevents YAML from interpreting labels such as `On`, `Off`,
`Yes`, or `No` as another data type.

For a command that accepts a numeric range, describe its argument under
`write.input` with a name, type, minimum, and maximum. Do not leave the range
only in prose.

## Evidence boundary

Each connection and capability uses one support level:

- `tested` means the capability was confirmed on real hardware through this
  gateway.
- `reported` means a user supplied the result but it has not been reproduced.
- `declared` means device data says the capability exists.
- `unknown` keeps an unconfirmed research lead visible.

Runtime code may consume only capabilities marked `tested`. Other levels remain
research until they are confirmed.

Do not record reference implementation names, repository locations, source
excerpts, or cross-references here. Convert useful findings into neutral device
facts and retain only the support level needed to judge them safely.

## Adding a device

Create a minimal new record with:

```sh
npm run catalogue:new -- T1234 "Camera name"
```

Alternatively, copy `DEVICE_TEMPLATE.yaml`. Add only what is known, remove the
example sections that do not apply, then run `npm run catalogue:check` from
`eufy_event_gateway`.

Use the model query when locating a record:

```sh
npm run catalogue:query -- T817L
npm run catalogue:query -- T817L night_vision
```

Do not add serial numbers, account details, camera names, credentials, or raw
payloads. Model numbers, numeric device types, protocol parameter identifiers,
and public evidence links are suitable for this catalogue.

## Supporting files

- `DEVICE_TEMPLATE.yaml` is the commented starting point for contributors.
- `device.schema.json` describes the simplified YAML format.
- `property-reference.json` is the legacy cross-device property glossary.
- `unmapped-device-types.json` records known numeric types without a confirmed
  retail model.
- `schema.json` documents the legacy JSON structure.

The device files are the maintained source. Contributors should update them
directly instead of importing private research material into the repository.
