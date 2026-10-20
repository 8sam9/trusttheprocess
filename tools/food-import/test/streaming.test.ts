import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const MB = 1024 * 1024;

// Tagged so a job that already runs it elsewhere can skip it: FOOD_IMPORT_SKIP_STREAMING=1 (see .github/workflows/ci.yml).
// It spawns a child process and takes about 25 s of CPU.
describe.skipIf(process.env['FOOD_IMPORT_SKIP_STREAMING'] === '1')(
  'USDA reader streaming (50k synthetic records, zipped)',
  () => {
    it('reads every record and keeps heap flat', () => {
      const run = spawnSync(
        process.execPath,
        ['--expose-gc', '--import', 'tsx', path.join(here, 'scripts', 'stream-memory.ts'), '50000'],
        { encoding: 'utf8', cwd: path.join(here, '..'), maxBuffer: 10 * MB, timeout: 240_000 },
      );
      expect(run.status, run.stderr).toBe(0);
      const last = run.stdout.trim().split('\n').at(-1) ?? '';
      const r = JSON.parse(last) as {
        n: number;
        candidates: number;
        zipBytes: number;
        uncompressedBytes: number;
        baseline: number;
        samples: number[];
      };

      expect(r.n).toBe(50_000);
      expect(r.candidates).toBe(50_000);
      expect(r.samples.length).toBe(10);
      expect(r.uncompressedBytes / MB).toBeGreaterThan(40);

      // Flat: after the first 5k records the heap (post-GC) must not keep growing with the record count.
      // Holding 50k parsed records would add well over 100 MB; allow a small constant for GC/JIT noise.
      const [first, ...rest] = r.samples as [number, ...number[]];
      const growth = Math.max(...rest) - first;
      expect(growth / MB).toBeLessThan(15);
      // And the whole thing stays far below the file's uncompressed size scale.
      expect((Math.max(...r.samples) - r.baseline) / MB).toBeLessThan(60);
    });
  },
);
