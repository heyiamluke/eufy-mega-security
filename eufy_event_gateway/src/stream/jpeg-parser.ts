export class JpegParser {
  #pending = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.#pending = Buffer.concat([this.#pending, chunk]);
    const images: Buffer[] = [];

    while (true) {
      const start = this.#pending.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) {
        this.#pending = this.#pending.subarray(Math.max(0, this.#pending.length - 1));
        break;
      }
      const end = this.#pending.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
      if (end < 0) {
        if (start > 0) this.#pending = this.#pending.subarray(start);
        break;
      }
      images.push(this.#pending.subarray(start, end + 2));
      this.#pending = this.#pending.subarray(end + 2);
    }
    return images;
  }
}
