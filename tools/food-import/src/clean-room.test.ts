import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALLOWED_HOSTS } from './download.js';

/**
 * AC 45 source scan: the tool's own files (code, config, fixtures, tests) reference only the official hosts and
 * no competitor. Names are assembled from fragments so this file does not contain them itself.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPETITORS = [
  ['my', 'fitness', 'pal'],
  ['cron', 'ometer'],
  ['fat', 'secret'],
  ['my', 'net', 'diary'],
  ['life', 'sum'],
  ['yaz', 'io'],
  ['lose', ' ', 'it'],
].map((parts) => parts.join(''));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.work' || name === '.reports') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|json|md|js|mjs)$/.test(name) && name !== 'package.json') out.push(full);
  }
  return out;
}

describe('clean-room scan (AC 45, ADR 0002)', () => {
  const files = walk(root);

  it('finds files to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('mentions no competitor', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8').toLowerCase();
      for (const c of COMPETITORS) {
        expect(text.includes(c), `${path.relative(root, f)} mentions ${c}`).toBe(false);
      }
    }
  });

  it('contains no https URL to a host outside the allowlist (source, config and fixtures)', () => {
    const allowed = new Set<string>(ALLOWED_HOSTS);
    for (const f of files) {
      if (f.endsWith('.test.ts')) continue; // tests use deliberately bad hosts
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        const host = (m[1] ?? '').toLowerCase();
        expect(allowed.has(host), `${path.relative(root, f)} references host ${host}`).toBe(true);
      }
    }
  });
});
