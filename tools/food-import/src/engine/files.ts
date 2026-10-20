import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Gzipped NDJSON writer for candidate rows (ADR 0007 plan phase). Backpressure-aware. */
export class WorkFileWriter {
  private readonly gzip = createGzip({ level: 1 });
  private readonly done: Promise<void>;
  private count = 0;

  private constructor(file: string) {
    this.done = pipeline(this.gzip, createWriteStream(file));
  }

  static async open(file: string): Promise<WorkFileWriter> {
    await mkdir(path.dirname(file), { recursive: true });
    return new WorkFileWriter(file);
  }

  async write(value: unknown): Promise<void> {
    this.count += 1;
    if (!this.gzip.write(`${JSON.stringify(value)}\n`)) {
      await new Promise<void>((resolve) => this.gzip.once('drain', resolve));
    }
  }

  get lines(): number {
    return this.count;
  }

  async close(): Promise<void> {
    this.gzip.end();
    await this.done;
  }
}

export async function* readWorkFile<T>(file: string): AsyncGenerator<T> {
  const lines = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (line !== '') yield JSON.parse(line) as T;
  }
}
