import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { remuxH264ToMp4 } from "../src/stream/live-stream-manager.js";

const execFileAsync = promisify(execFile);

test("packages an Annex B H.264 camera stream as a fragmented MP4", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eufy-clip-test-"));
  const source = join(directory, "source.h264");
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x90:rate=10",
      "-t",
      "0.5",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-f",
      "h264",
      source,
    ]);
    const mp4 = await remuxH264ToMp4(await readFile(source));
    assert.equal(mp4.subarray(4, 8).toString("ascii"), "ftyp");
    assert.ok(mp4.includes(Buffer.from("moov")));
    assert.ok(mp4.includes(Buffer.from("moof")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
