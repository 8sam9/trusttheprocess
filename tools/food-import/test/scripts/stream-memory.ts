/**
 * Child process for test/streaming.test.ts (run with `node --expose-gc --import tsx`).
 * Writes a SYNTHETIC zipped Foundation-shaped file of N records without buffering it, streams it back through
 * the full reader (zip, stream-json, zod, normaliser) and prints heap samples as JSON on the last stdout line.
 */
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../src/config.js';
import { readUsdaGeneric } from '../../src/usda/reader.js';
import { N, foundationRecord } from '../helpers/synthetic-usda.js';
import { writeZip } from '../helpers/zip.js';

const total = Number(process.argv[2] ?? '50000');
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error('run with --expose-gc');

function record(i: number): string {
  const protein = 5 + (i % 10);
  const fat = 3 + (i % 7);
  const carbs = 10 + (i % 20);
  return JSON.stringify(
    foundationRecord({
      fdcId: 1_000_000 + i,
      ndbNumber: 100_000 + i,
      description: `Synthetic test food number ${i} with a reasonably long descriptive name`,
      nutrients: [
        N.kcal(4 * protein + 4 * carbs + 9 * fat),
        N.protein(protein),
        N.fat(fat),
        N.carbs(carbs),
        N.fibre(i % 5),
        N.sugars(i % 9),
        N.satfat(i % 3),
        N.sodium(i % 400),
      ],
      portions: [1, 2, 3].map((k) => ({
        amount: k,
        gramWeight: 25 * k,
        modifier: `portion ${k} of item ${i}`,
        sequenceNumber: k,
        measureUnit: { name: 'undetermined' },
      })),
    }),
  );
}

let uncompressedBytes = 0;
async function* content(): AsyncGenerator<string> {
  const head = '{"FoundationFoods":[';
  uncompressedBytes += head.length;
  yield head;
  for (let i = 0; i < total; i += 1) {
    const piece = (i === 0 ? '' : ',') + record(i);
    uncompressedBytes += Buffer.byteLength(piece);
    yield piece;
  }
  yield ']}';
}

const dir = mkdtempSync(path.join(process.env['TMPDIR'] ?? tmpdir(), 'food-import-stream-'));
try {
  const file = path.join(dir, 'foundation.zip');
  await writeZip(file, 'FoodData_Central_foundation_food_json_synthetic.json', content());
  const zipBytes = statSync(file).size;

  const { rules } = loadConfig();
  const sample = (): number => {
    gc();
    return process.memoryUsage().heapUsed;
  };
  const samples: number[] = [];
  let n = 0;
  let candidates = 0;
  const baseline = sample();
  for await (const outcome of readUsdaGeneric(file, 'usda_foundation', rules)) {
    n += 1;
    if (outcome.kind === 'candidate') candidates += 1;
    if (n % 5000 === 0) samples.push(sample());
  }
  console.log(JSON.stringify({ n, candidates, zipBytes, uncompressedBytes, baseline, samples }));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
