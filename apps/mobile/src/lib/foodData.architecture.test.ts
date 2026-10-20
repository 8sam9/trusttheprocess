import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * AC 6b / ADR 0006 point 7: lib/foodData.ts is the only file in the app that names a food RPC or the food
 * schema. Edge functions get the same rule when supabase/functions/_shared/foodData.ts exists (008).
 */
const SRC = path.resolve(__dirname, '..');
const ALLOWED = path.join(SRC, 'lib', 'foodData.ts');
const FORBIDDEN = [/get_foods/, /lookup_barcode/, /search_foods/, /schema\(\s*['"`]food['"`]\s*\)/];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('food data access boundary', () => {
  const files = walk(SRC).filter(
    (f) =>
      f !== ALLOWED &&
      !f.endsWith('foodData.test.ts') &&
      !f.endsWith('foodData.architecture.test.ts'),
  );

  it('scans a non-trivial number of files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('no other file references the food RPCs or the food schema', () => {
    const offenders = files.filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return FORBIDDEN.some((re) => re.test(text));
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('the access module itself names all three RPCs', () => {
    const text = fs.readFileSync(ALLOWED, 'utf8');
    for (const name of ['get_foods', 'lookup_barcode', 'search_foods'])
      expect(text).toContain(name);
  });
});
