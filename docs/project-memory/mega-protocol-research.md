# Mega protocol research

## Goal

Recover only the read-only Eufy Mega v6 calls needed to enumerate Security cameras that the legacy device-list API omits. Do not reproduce the Eufy application or broaden the work into camera configuration, account mutation, or cloud recording access.

## Evidence from 2026-09-11

- Examined the user-supplied Eufy Security v6.0.90 build 29798 XAPK in an isolated, rooted Android test environment.
- The app's iJiami protection prevented conventional debugger attachment, but Android's rooted process-memory access allowed the runtime-unpacked DEX files to be recovered without bypassing the app's account or backend controls.
- The recovered Security implementation identifies `POST /app/house/get_devs_list` as the current device inventory call.
- Its request body contains `house_id`, `device_sns`, and optional `categories` and `add_pns` fields. Sending an empty `house_id` and empty `device_sns` map returns all devices available to the signed-in account.
- The response contains `devices` and `groups`. Whitelisted device fields include `device_sn`, `device_name`, `device_model`, `parent_sn`, `device_type`, and `category`.
- The installed `eufy-security-client` already implements Mega domain discovery, key exchange, request signing, encryption, session persistence, and a generic decrypted call. Its convenience device-list method uses an older speculative body, so the gateway calls the generic transport with the request shape verified from the current app.

## Live validation

- A live encrypted Mega request succeeded using the gateway's existing persisted Mega session.
- Before Front of House was shared to the dedicated integration account, both the all-device result and Eufy's `shared.devices` collection omitted it.
- Immediately after sharing, both results contained Front of House as model `T817L`, device type `10031`, category `eufy_security`, parented to the HomeBase 3.
- This proves that the prior omission was an account-sharing configuration issue and that the new Mega inventory path can recover the C31 record once the account is authorized to see it.

## Implementation boundary

Mega inventory is an additional, failure-isolated discovery source. Legacy discovery remains responsible for device objects and HomeBase P2P stream control. Mega-only camera records receive Eufy push detections but are not treated as P2P-capable until the upstream client supplies a controllable device object. Powered cameras such as the T817L continue to use their own RTSP stream for video.

Only whitelisted inventory fields may leave the provider. Passwords, access tokens, signing keys, household identifiers, raw responses, notification text, and media URLs must never be logged or exposed by diagnostics.
