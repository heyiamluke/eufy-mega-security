/** Durable last-good camera images with serialized, atomic writes. */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SnapshotInfo } from "../domain/types.js";

interface SnapshotRecord {
  readonly serial: string;
  readonly info: SnapshotInfo;
}

export class SnapshotStore {
  readonly #directory: string;
  readonly #records = new Map<string, SnapshotInfo>();
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDirectory: string) {
    this.#directory = join(dataDirectory, "snapshots");
  }

  async initialize(): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    try {
      const records = JSON.parse(await readFile(join(this.#directory, "index.json"), "utf8")) as SnapshotRecord[];
      for (const record of records) this.#records.set(record.serial, record.info);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  getInfo(serial: string): SnapshotInfo | null {
    return this.#records.get(serial) ?? null;
  }

  async read(serial: string): Promise<{ data: Buffer; info: SnapshotInfo } | null> {
    const info = this.#records.get(serial);
    if (!info) return null;
    try {
      return { data: await readFile(this.#imagePath(serial)), info };
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async write(
    serial: string,
    data: Buffer,
    contentType: string,
    source: SnapshotInfo["source"],
    capturedAt = new Date(),
  ): Promise<SnapshotInfo> {
    const operation = this.#writeQueue.then(async () => {
      if (data.length === 0) throw new Error("Refusing to replace a snapshot with an empty image");
      const previous = this.#records.get(serial);
      const info: SnapshotInfo = {
        capturedAt: capturedAt.toISOString(),
        contentType,
        source,
        revision: (previous?.revision ?? 0) + 1,
      };
      await atomicWrite(this.#imagePath(serial), data);
      this.#records.set(serial, info);
      await this.#writeIndex();
      return info;
    });
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async #writeIndex(): Promise<void> {
    const records = [...this.#records.entries()].map(([serial, info]) => ({ serial, info }));
    await atomicWrite(join(this.#directory, "index.json"), Buffer.from(`${JSON.stringify(records, null, 2)}\n`));
  }

  #imagePath(serial: string): string {
    const safeName = createHash("sha256").update(serial).digest("hex");
    return join(this.#directory, `${safeName}.image`);
  }
}

async function atomicWrite(path: string, data: Buffer): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, data, { mode: 0o600 });
  await rename(temporaryPath, path);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
