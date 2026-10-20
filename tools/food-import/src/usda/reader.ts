import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline, type Readable } from 'node:stream';
import yauzl from 'yauzl';
import parserStream from 'stream-json';
import pick from 'stream-json/filters/pick.js';
import streamArray from 'stream-json/streamers/stream-array.js';
import type { RulesConfig } from '../schemas/config.js';
import type { FoodOutcome, ParseFailure } from '../types.js';
import { normaliseUsdaGeneric } from './normalise.js';
import {
  UsdaGenericFood,
  USDA_TOP_KEY,
  detectUsdaDataset,
  type UsdaDataset,
  type UsdaGenericDataset,
} from './schemas.js';

export class UsdaFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsdaFormatError';
  }
}

interface OpenedStream {
  stream: Readable;
  /** Releases the underlying file handle(s); safe to call twice. */
  close: () => void;
}

function openZipEntry(file: string): Promise<OpenedStream> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (openErr, zip) => {
      if (openErr || !zip) {
        reject(
          new UsdaFormatError(
            `cannot open archive ${file}: ${openErr?.message ?? 'unknown error'}`,
          ),
        );
        return;
      }
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(new UsdaFormatError(message));
      };
      zip.on('error', (e) => fail(`archive ${file} is unreadable: ${e.message}`));
      zip.on('end', () => fail(`archive ${file} contains no .json file`));
      zip.on('entry', (entry: yauzl.Entry) => {
        if (settled) return;
        if (/\/$/.test(entry.fileName) || !/\.json$/i.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            fail(
              `cannot read ${entry.fileName} in ${file}: ${streamErr?.message ?? 'unknown error'}`,
            );
            return;
          }
          settled = true;
          resolve({ stream, close: () => zip.close() });
        });
      });
      zip.readEntry();
    });
  });
}

/** Opens a USDA JSON file, either a .zip holding one .json entry (the official download) or a plain .json. */
export async function openUsdaJson(file: string): Promise<OpenedStream> {
  try {
    await stat(file);
  } catch {
    throw new UsdaFormatError(`input file not found: ${file}`);
  }
  if (/\.csv$/i.test(file)) {
    throw new UsdaFormatError(
      `${file} is CSV; use the JSON dump (the CSV export is not supported)`,
    );
  }
  if (/\.zip$/i.test(file)) return openZipEntry(file);
  const stream = createReadStream(file);
  return { stream, close: () => stream.destroy() };
}

/** Preflight (AC 38): the first key of the top-level object, read without parsing the rest of the file. */
export async function readTopLevelKey(file: string): Promise<string> {
  const { stream, close } = await openUsdaJson(file);
  const tokens = pipeline(stream, parserStream(), () => undefined);
  try {
    for await (const token of tokens as AsyncIterable<{ name: string; value?: unknown }>) {
      if (token.name === 'keyValue') return String(token.value);
      if (token.name === 'startArray') break;
    }
    throw new UsdaFormatError(
      `${file} is not a USDA FoodData Central JSON file (no top-level key)`,
    );
  } catch (err) {
    if (err instanceof UsdaFormatError) throw err;
    throw new UsdaFormatError(`${file} is not valid JSON: ${(err as Error).message}`);
  } finally {
    tokens.destroy();
    close();
  }
}

/**
 * Streams the raw records of `dataset` from the file, one at a time, with backpressure (memory stays flat,
 * independent of file size). Fails before yielding anything if the top-level key does not match the dataset.
 */
export async function* streamUsdaRecords(
  file: string,
  dataset: UsdaDataset,
): AsyncGenerator<unknown> {
  const expected = USDA_TOP_KEY[dataset];
  const actual = await readTopLevelKey(file);
  if (actual !== expected) {
    const detected = detectUsdaDataset(actual);
    throw new UsdaFormatError(
      `${file} has top-level key "${actual}"${detected ? ` (a ${detected} file)` : ''}, but dataset ${dataset} expects "${expected}"`,
    );
  }
  const { stream, close } = await openUsdaJson(file);
  const records = pipeline(
    stream,
    pick.withParserAsStream({ filter: expected }),
    streamArray.asStream(),
    () => undefined,
  );
  try {
    for await (const item of records as AsyncIterable<{ key: number; value: unknown }>) {
      yield item.value;
    }
  } catch (err) {
    throw new UsdaFormatError(`${file} could not be read: ${(err as Error).message}`);
  } finally {
    records.destroy();
    close();
  }
}

/**
 * Reads a Foundation / SR Legacy / FNDDS file and yields one outcome per record: a candidate, a rejection,
 * or a parse failure (record does not match the pinned shape). Nothing is retained between records.
 */
export async function* readUsdaGeneric(
  file: string,
  dataset: UsdaGenericDataset,
  rules: RulesConfig,
): AsyncGenerator<FoodOutcome | ParseFailure> {
  let index = 0;
  for await (const raw of streamUsdaRecords(file, dataset)) {
    const parsed = UsdaGenericFood.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      yield {
        kind: 'parse_error',
        index,
        message: `${issue?.path.join('.') || '(record)'}: ${issue?.message ?? 'invalid'}`,
      };
    } else {
      yield normaliseUsdaGeneric(parsed.data, dataset, rules);
    }
    index += 1;
  }
}
