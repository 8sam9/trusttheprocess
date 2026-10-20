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

  it('engine commands report that B6 is pending (exit 2) rather than pretending to run', async () => {
    const r = await run(['import', '--manifest', 'm.json']);
    expect(r.code).toBe(2);
  });
});
