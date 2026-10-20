import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FoodDataset } from '@ttp/shared';

/**
 * Optional download helper (spec T5.2, AC 45): official hosts only, bulk files only, polite User-Agent.
 * The importer itself never needs the network; it reads local files.
 */

export const USDA_HOST = 'fdc.nal.usda.gov';
export const OFF_HOST = 'static.openfoodfacts.org';
export const ALLOWED_HOSTS: readonly string[] = [USDA_HOST, OFF_HOST];

/** The OFF food JSONL dump (T6.2). USDA file names carry the release date, so USDA needs an explicit --url. */
export const DEFAULT_OFF_DUMP_URL = `https://${OFF_HOST}/data/openfoodfacts-products.jsonl.gz`;

export const MAX_REDIRECTS = 3;

export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

export function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DownloadError('not a valid URL');
  }
  if (url.protocol !== 'https:')
    throw new DownloadError(`only https is allowed, got ${url.protocol}`);
  if (url.username || url.password) throw new DownloadError('URLs with credentials are refused');
  if (url.port && url.port !== '443') throw new DownloadError('non-standard ports are refused');
  if (!ALLOWED_HOSTS.includes(url.hostname.toLowerCase())) {
    throw new DownloadError(
      `host "${url.hostname}" is not allowed; allowed hosts: ${ALLOWED_HOSTS.join(', ')}`,
    );
  }
  return url;
}

/** USDA datasets may only come from the USDA host, OFF only from the OFF host. */
export function assertHostMatchesDataset(url: URL, dataset: FoodDataset): void {
  const expected = dataset === 'off' ? OFF_HOST : USDA_HOST;
  if (url.hostname.toLowerCase() !== expected) {
    throw new DownloadError(
      `dataset ${dataset} must be downloaded from ${expected}, not ${url.hostname}`,
    );
  }
}

/** `TrustTheProcess-food-import/<version> (<contact>)`, as OFF's API rules ask. Contact is mandatory. */
export function buildUserAgent(version: string, contact: string | undefined): string {
  const c = (contact ?? '').trim();
  if (!c) {
    throw new DownloadError(
      'FOOD_IMPORT_CONTACT is not set. Set it to a contact email or URL: Open Food Facts asks every client to identify itself.',
    );
  }
  if (!/^[^\s()<>]+@[^\s()<>]+\.[^\s()<>]+$/.test(c) && !/^https:\/\/[^\s()<>]+$/.test(c)) {
    throw new DownloadError('FOOD_IMPORT_CONTACT must be an email address or an https URL');
  }
  return `TrustTheProcess-food-import/${version} (${c})`;
}

export interface DownloadOptions {
  url: string;
  dataset: FoodDataset;
  outPath: string;
  version: string;
  contact: string | undefined;
  fetchImpl?: typeof fetch;
}

/** Streams a file to `outPath` (via a .part file, renamed on success). Every redirect hop is re-checked. */
export async function downloadFile(opts: DownloadOptions): Promise<{ bytes: number }> {
  // Open Food Facts requires a contact in the User-Agent (AC 45). USDA asks for none, so a USDA download works
  // without FOOD_IMPORT_CONTACT (it still names the app and version), which keeps cut-fixture one command.
  const userAgent =
    opts.dataset === 'off' || (opts.contact ?? '').trim() !== ''
      ? buildUserAgent(opts.version, opts.contact)
      : `TrustTheProcess-food-import/${opts.version}`;
  const doFetch = opts.fetchImpl ?? fetch;
  let url = assertAllowedUrl(opts.url);
  assertHostMatchesDataset(url, opts.dataset);

  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    response = await doFetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': userAgent, Accept: '*/*' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location)
        throw new DownloadError(`redirect without a location (HTTP ${response.status})`);
      url = assertAllowedUrl(new URL(location, url).toString());
      assertHostMatchesDataset(url, opts.dataset);
      continue;
    }
    break;
  }
  if (!response || (response.status >= 300 && response.status < 400)) {
    throw new DownloadError(`too many redirects (more than ${MAX_REDIRECTS})`);
  }
  if (!response.ok || !response.body) {
    throw new DownloadError(`download failed: HTTP ${response.status} from ${url.hostname}`);
  }

  const part = `${opts.outPath}.part`;
  let bytes = 0;
  const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  source.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
  });
  try {
    await pipeline(source, createWriteStream(part));
    await rename(part, opts.outPath);
  } catch (err) {
    await rm(part, { force: true });
    throw err;
  }
  return { bytes };
}
