import assert from "node:assert/strict";
import test from "node:test";

import { downloadPushSnapshot } from "../src/provider/eufy-provider.js";

const jpeg = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);

test("downloads a plain JPEG from a push-only camera notification", async () => {
  let stationLookups = 0;
  const client = {
    getApi: () => ({
      request: async () => ({ status: 200, data: jpeg }),
    }),
    getStation: async () => {
      stationLookups += 1;
      return { getRawStation: () => ({ p2p_did: "station-did" }) };
    },
  };

  const picture = await downloadPushSnapshot(client, {
    device_sn: "camera-1",
    station_sn: "station-1",
    pic_url: "https://example.invalid/signed-event-image",
  });

  assert.deepEqual(picture, { data: jpeg, type: { ext: "jpg", mime: "image/jpeg" } });
  assert.equal(stationLookups, 0);
});

test("decodes an obfuscated push image using its parent station", async () => {
  let decoderDid: string | null = null;
  const client = {
    getApi: () => ({
      request: async () => ({ status: 200, data: Buffer.from("encoded") }),
    }),
    getStation: async (serial: string) => {
      assert.equal(serial, "station-1");
      return { getRawStation: () => ({ p2p_did: "station-did" }) };
    },
  };

  const picture = await downloadPushSnapshot(
    client,
    { device_sn: "camera-1", station_sn: "station-1", pic_url: "https://example.invalid/image" },
    async (did) => {
      decoderDid = did;
      return jpeg;
    },
  );

  assert.equal(decoderDid, "station-did");
  assert.deepEqual(picture?.data, jpeg);
});

test("rejects non-HTTPS, empty, oversized, and invalid event images", async () => {
  const response = { status: 200, data: Buffer.alloc(0) };
  const client = {
    getApi: () => ({ request: async () => response }),
    getStation: async () => ({ getRawStation: () => ({ p2p_did: "station-did" }) }),
  };
  const message = { device_sn: "camera-1", station_sn: "station-1", pic_url: "http://example.invalid/image" };

  assert.equal(await downloadPushSnapshot(client, message), null);

  message.pic_url = "https://example.invalid/image";
  assert.equal(await downloadPushSnapshot(client, message), null);

  response.data = Buffer.alloc(20 * 1024 * 1024 + 1);
  await assert.rejects(downloadPushSnapshot(client, message), /20 MB safety limit/);

  response.data = Buffer.from("not-an-image");
  await assert.rejects(downloadPushSnapshot(client, message, async (_did, data) => data), /not a valid JPEG/);
});
