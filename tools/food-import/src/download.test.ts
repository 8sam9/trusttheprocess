import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ALLOWED_HOSTS,
  DEFAULT_OFF_DUMP_URL,
  DownloadError,
  assertAllowedUrl,
  buildUserAgent,
  downloadFile,
} from './download.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'food-import-dl-'));
  dirs.push(d);
  return d;
}

describe('host allowlist (AC 45)', () => {
  it('allows exactly the two official hosts over https', () => {
    expect([...ALLOWED_HOSTS].sort()).toEqual(['fdc.nal.usda.gov', 'static.openfoodfacts.org']);
    expect(() => assertAllowedUrl('https://fdc.nal.usda.gov/fdc-datasets/x.zip')).not.toThrow();
    expect(() => assertAllowedUrl(DEFAULT_OFF_DUMP_URL)).not.toThrow();
  });

  it.each([
    'http://fdc.nal.usda.gov/x.zip',
    'https://world.openfoodfacts.org/api/v2/search',
    'https://fdc.nal.usda.gov.evil.example/x.zip',
    'https://evil.example/fdc.nal.usda.gov',
    'https://user:pw@fdc.nal.usda.gov/x.zip',
    'https://fdc.nal.usda.gov:8443/x.zip',
    'ftp://static.openfoodfacts.org/x',
    'not a url',
  ])('refuses %s', (url) => {
    expect(() => assertAllowedUrl(url)).toThrow(DownloadError);
  });
});

describe('User-Agent (AC 45)', () => {
  it('names the app, its version and a contact', () => {
    expect(buildUserAgent('0.1.0', 'ops@example.org')).toBe(
      'TrustTheProcess-food-import/0.1.0 (ops@example.org)',
    );
    expect(buildUserAgent('0.1.0', 'https://example.org/contact')).toContain(
      '(https://example.org/contact)',
    );
  });
  it('refuses a missing or malformed contact', () => {
    expect(() => buildUserAgent('0.1.0', undefined)).toThrow(/FOOD_IMPORT_CONTACT/);
    expect(() => buildUserAgent('0.1.0', '  ')).toThrow(/FOOD_IMPORT_CONTACT/);
    expect(() => buildUserAgent('0.1.0', 'no spaces@or ( parens')).toThrow(DownloadError);
  });
});

describe('downloadFile', () => {
  const body = () => new Response('hello bulk file', { status: 200 });

  it('sends the User-Agent, streams to the file and returns the byte count', async () => {
    const seen: { url: string; ua: string | null }[] = [];
    const fetchImpl = ((url: URL, init: RequestInit) => {
      seen.push({ url: url.toString(), ua: new Headers(init.headers).get('user-agent') });
      return Promise.resolve(body());
    }) as unknown as typeof fetch;
    const out = path.join(tmp(), 'dump.gz');
    const r = await downloadFile({
      url: DEFAULT_OFF_DUMP_URL,
      dataset: 'off',
      outPath: out,
      version: '0.1.0',
      contact: 'ops@example.org',
      fetchImpl,
    });
    expect(r.bytes).toBe(15);
    expect(readFileSync(out, 'utf8')).toBe('hello bulk file');
    expect(seen[0]?.ua).toBe('TrustTheProcess-food-import/0.1.0 (ops@example.org)');
    expect(existsSync(`${out}.part`)).toBe(false);
  });

  it('a USDA download works without a contact (it still names the app); OFF never does', async () => {
    const seen: (string | null)[] = [];
    const fetchImpl = ((_url: URL, init: RequestInit) => {
      seen.push(new Headers(init.headers).get('user-agent'));
      return Promise.resolve(body());
    }) as unknown as typeof fetch;
    await downloadFile({
      url: 'https://fdc.nal.usda.gov/fdc-datasets/x.zip',
      dataset: 'usda_foundation',
      outPath: path.join(tmp(), 'x.zip'),
      version: '0.1.0',
      contact: undefined,
      fetchImpl,
    });
    expect(seen[0]).toBe('TrustTheProcess-food-import/0.1.0');
    await expect(
      downloadFile({
        url: DEFAULT_OFF_DUMP_URL,
        dataset: 'off',
        outPath: path.join(tmp(), 'y'),
        version: '0.1.0',
        contact: undefined,
        fetchImpl,
      }),
    ).rejects.toThrow(/FOOD_IMPORT_CONTACT/);
  });

  it('follows redirects only within the allowlist', async () => {
    let calls = 0;
    const fetchImpl = (() => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } })
          : body(),
      );
    }) as unknown as typeof fetch;
    await expect(
      downloadFile({
        url: DEFAULT_OFF_DUMP_URL,
        dataset: 'off',
        outPath: path.join(tmp(), 'x'),
        version: '1',
        contact: 'a@b.co',
        fetchImpl,
      }),
    ).rejects.toThrow(/not allowed/);
    expect(calls).toBe(1);
  });

  it('refuses a dataset/host mismatch and does not even call fetch', async () => {
    let called = false;
    const fetchImpl = (() => {
      called = true;
      return Promise.resolve(body());
    }) as unknown as typeof fetch;
    await expect(
      downloadFile({
        url: DEFAULT_OFF_DUMP_URL,
        dataset: 'usda_foundation',
        outPath: path.join(tmp(), 'x'),
        version: '1',
        contact: 'a@b.co',
        fetchImpl,
      }),
    ).rejects.toThrow(/must be downloaded from/);
    expect(called).toBe(false);
  });

  it('reports HTTP errors and leaves no partial file', async () => {
    const out = path.join(tmp(), 'dump.gz');
    const fetchImpl = (() =>
      Promise.resolve(new Response('no', { status: 403 }))) as unknown as typeof fetch;
    await expect(
      downloadFile({
        url: DEFAULT_OFF_DUMP_URL,
        dataset: 'off',
        outPath: out,
        version: '1',
        contact: 'a@b.co',
        fetchImpl,
      }),
    ).rejects.toThrow(/HTTP 403/);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(`${out}.part`)).toBe(false);
  });
});
