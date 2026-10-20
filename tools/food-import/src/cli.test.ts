import { describe, expect, it } from 'vitest';
import { main } from './cli.js';

function run(argv: string[], env: Record<string, string | undefined> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return main(
    argv,
    env,
    (l) => out.push(l),
    (l) => err.push(l),
  ).then((code) => ({ code, out, err }));
}

describe('cli main', () => {
  it('prints usage for help and exits 0', async () => {
    const r = await run(['help']);
    expect(r.code).toBe(0);
    expect(r.out.join('\n')).toContain('Usage: food-import');
  });

  it('usage errors exit 64 with an actionable message', async () => {
    const r = await run(['import']);
    expect(r.code).toBe(64);
    expect(r.err[0]).toMatch(/--manifest is required/);
  });

  it('refuses an unsafe remote invocation before anything else (exit 1)', async () => {
    const r = await run(['import', '--manifest', 'm.json', '--apply', '--target', 'remote']);
    expect(r.code).toBe(1);
    expect(r.err[0]).toMatch(/FOOD_IMPORT_DATABASE_URL/);
  });

  it('download without a contact is refused before any network call', async () => {
    const r = await run(['download', '--dataset', 'off', '--out', '/nonexistent-dir-for-test'], {});
    expect(r.code).toBe(1);
    expect(r.err[0]).toMatch(/FOOD_IMPORT_CONTACT/);
  });

  it('USDA download needs an explicit --url', async () => {
    const r = await run(['download', '--dataset', 'usda_foundation', '--out', 'x']);
    expect(r.code).toBe(64);
    expect(r.err[0]).toMatch(/--url/);
  });

  it('an import with a missing manifest fails before touching the database (exit 1)', async () => {
    const r = await run(['import', '--manifest', 'does-not-exist.json'], {
      FOOD_IMPORT_LOCAL_DATABASE_URL: 'postgresql://postgres@127.0.0.1:1/none',
    });
    expect(r.code).toBe(1);
    expect(r.err[0]).toMatch(/cannot read manifest/);
  });

  it('cut-fixture with a folder that has no USDA files names the problem', async () => {
    const r = await run(['cut-fixture', '--from', '/nonexistent-dir-for-test']);
    expect(r.code).not.toBe(0);
  });
});
