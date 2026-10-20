import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG_DIR, loadConfig } from './config.js';
import { Manifest } from './schemas/manifest.js';

const dirs: string[] = [];
function copyConfig(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'food-import-config-'));
  dirs.push(dir);
  cpSync(DEFAULT_CONFIG_DIR, dir, { recursive: true });
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('config', () => {
  it('loads the checked-in config', () => {
    const c = loadConfig();
    expect(c.markets.markets.us?.enabled).toBe(true);
    expect(c.markets.markets.it?.enabled).toBe(true);
    // beta: only US and Italy are on (spec Q1/Q3)
    const enabled = Object.entries(c.markets.markets)
      .filter(([, m]) => m.enabled)
      .map(([k]) => k);
    expect(enabled.sort()).toEqual(['it', 'us']);
    // AC 4: Italy accepts English or Italian names, every other market English only
    expect(c.markets.markets.it?.nameLanguages).toEqual(['en', 'it']);
    expect(c.markets.markets.gb?.nameLanguages).toEqual(['en']);
    expect(c.rules.atwaterMismatch).toEqual({ relative: 0.2, absoluteKcal: 25 });
    expect(c.rules.energyImplausible).toEqual({ relative: 0.5, absoluteKcal: 100 });
    expect(c.budget.budgetBytes).toBe(300 * 1024 * 1024);
    expect(c.budget.hardCeilingBytes).toBe(450 * 1024 * 1024);
  });

  it('rejects an unknown key (typos must not be silently ignored)', () => {
    const dir = copyConfig();
    const file = path.join(dir, 'rules.json');
    const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    json['energyMaxKcall'] = 1;
    writeFileSync(file, JSON.stringify(json));
    expect(() => loadConfig(dir)).toThrow(ConfigError);
  });

  it('rejects out-of-range and malformed values with the file and field named', () => {
    const dir = copyConfig();
    const file = path.join(dir, 'budget.json');
    const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    json['hardCeilingBytes'] = 1;
    writeFileSync(file, JSON.stringify(json));
    expect(() => loadConfig(dir)).toThrow(/budget\.json.*hardCeilingBytes/);

    writeFileSync(file, '{ not json');
    expect(() => loadConfig(dir)).toThrow(/cannot read config/);
  });

  it('rejects a market with a bad country tag or no languages', () => {
    const dir = copyConfig();
    const file = path.join(dir, 'markets.json');
    const json = JSON.parse(readFileSync(file, 'utf8')) as {
      markets: Record<string, Record<string, unknown>>;
    };
    json.markets['it'] = { ...json.markets['it'], nameLanguages: [] };
    writeFileSync(file, JSON.stringify(json));
    expect(() => loadConfig(dir)).toThrow(ConfigError);
  });
});

describe('manifest schema', () => {
  const input = {
    dataset: 'usda_foundation',
    path: 'a.zip',
    releaseLabel: '2025-12',
    snapshot: true,
  };
  it('accepts a full run with a snapshot input', () => {
    expect(Manifest.safeParse({ mode: 'full', inputs: [input] }).success).toBe(true);
  });
  it('refuses snapshot: true in a partial run (AC 35)', () => {
    expect(Manifest.safeParse({ mode: 'partial', inputs: [input] }).success).toBe(false);
  });
  it('refuses the same dataset twice and unknown datasets', () => {
    expect(Manifest.safeParse({ mode: 'full', inputs: [input, input] }).success).toBe(false);
    expect(
      Manifest.safeParse({ mode: 'full', inputs: [{ ...input, dataset: 'usda_other' }] }).success,
    ).toBe(false);
  });
});
