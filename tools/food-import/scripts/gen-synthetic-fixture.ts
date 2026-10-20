/**
 * Bootstrap generator for the SYNTHETIC USDA fixture files (spec T7, H1). Run once by an engineer:
 *   pnpm --filter @ttp/food-import exec tsx scripts/gen-synthetic-fixture.ts
 * The output is checked in. `pnpm food:cut-fixture` (run by the human on a machine that can reach USDA) replaces the
 * golden placeholders with real records and keeps the purpose-built rule rows, which are permanent.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { N, entry, foundationRecord, type SynthNutrient } from '../test/helpers/synthetic-usda.js';
import { deriveFoundationV2 } from '../src/fixture/v2.js';
import { DATASET_OF, GOLDEN_ROWS } from './golden-table.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
mkdirSync(path.join(root, 'usda'), { recursive: true });

const UNIT_WORDS = new Set(['cup', 'tbsp', 'tsp', 'oz']);

/** Upstream-shaped portion for a label such as "1 large", "1 cup, chopped" or "0.5 cup". */
function portionFor(label: string, grams: number, seq: number, fnddsStyle: boolean) {
  if (fnddsStyle) {
    return { portionDescription: label, gramWeight: grams, sequenceNumber: seq };
  }
  const m = /^(\d+(?:\.\d+)?) (\S+)(?:, (.+))?$/.exec(label);
  if (!m) throw new Error(`bad serving label ${label}`);
  const amount = Number(m[1]);
  const word = m[2] as string;
  const rest = m[3];
  if (UNIT_WORDS.has(word)) {
    return {
      amount,
      gramWeight: grams,
      sequenceNumber: seq,
      ...(rest ? { modifier: rest } : {}),
      measureUnit: { name: word, abbreviation: word },
    };
  }
  return {
    amount,
    gramWeight: grams,
    sequenceNumber: seq,
    modifier: rest ? `${word}, ${rest}` : word,
    measureUnit: { name: 'undetermined', abbreviation: 'undetermined' },
  };
}

const GOLDEN_NOTE =
  'SYNTHETIC placeholder: approximate values written by hand, NOT USDA data. Replaced by pnpm food:cut-fixture.';

function goldenRecords(ds: 'usda_foundation' | 'usda_sr_legacy' | 'usda_fndds') {
  return GOLDEN_ROWS.flatMap((row, i) => {
    const [
      k,
      ref,
      description,
      kcal,
      protein,
      carbs,
      fat,
      fibre,
      sugars,
      satfat,
      sodium,
      alcohol,
      label,
      grams,
    ] = row;
    if (DATASET_OF[k] !== ds) return [];
    const nutrients: SynthNutrient[] = [
      N.kcal(kcal),
      N.protein(protein),
      N.fat(fat),
      N.carbs(carbs),
      ...(fibre === null ? [] : [N.fibre(fibre)]),
      ...(sugars === null ? [] : [N.sugars(sugars)]),
      ...(satfat === null ? [] : [N.satfat(satfat)]),
      ...(sodium === null ? [] : [N.sodium(sodium)]),
      ...(alcohol === null ? [] : [N.alcohol(alcohol)]),
    ];
    const rec = foundationRecord({
      fdcId: 9000000 + i,
      description,
      dataType:
        ds === 'usda_sr_legacy'
          ? 'SR Legacy'
          : ds === 'usda_fndds'
            ? 'Survey (FNDDS)'
            : 'Foundation',
      publicationDate: ds === 'usda_fndds' ? '10/31/2024' : '4/1/2018',
      ...(ds === 'usda_fndds' ? { foodCode: ref } : { ndbNumber: Number(ref) }),
      nutrients,
      portions:
        label === null || grams === null ? [] : [portionFor(label, grams, 1, ds === 'usda_fndds')],
    });
    delete rec['foodCategory'];
    delete rec['inputFoods'];
    rec['foodNutrients'] = nutrients.map((n) => entry(n));
    rec['x_synthetic'] = 'golden-placeholder';
    rec['x_note'] = GOLDEN_NOTE;
    return [rec];
  });
}

function ruleRow(
  ref: string,
  id: number,
  description: string,
  nutrients: SynthNutrient[],
  portions: Record<string, unknown>[] = [],
) {
  const rec = foundationRecord({
    fdcId: 9100000 + id,
    description,
    dataType: 'Foundation',
    publicationDate: '4/1/2025',
    ndbNumber: ref,
    nutrients,
    portions,
  });
  delete rec['foodCategory'];
  delete rec['inputFoods'];
  rec['x_synthetic'] = 'rule-row';
  return rec;
}

const base = (over: Partial<Record<'kcal' | 'p' | 'c' | 'f', number | null>> = {}) => [
  N.kcal(over.kcal === undefined ? 87 : over.kcal),
  N.protein(over.p === undefined ? 5 : over.p),
  N.carbs(over.c === undefined ? 10 : over.c),
  N.fat(over.f === undefined ? 3 : over.f),
];

const slice = (grams: number, seq: number, mod: string) => ({
  amount: 1,
  gramWeight: grams,
  modifier: mod,
  sequenceNumber: seq,
  measureUnit: { name: 'undetermined', abbreviation: 'undetermined' },
});

/** Purpose-built rows (AC 8 to 22). source_ref starts with "synthetic-", names with "Test ". */
function ruleRows() {
  let i = 0;
  const r = (ref: string, desc: string, n: SynthNutrient[], p: Record<string, unknown>[] = []) =>
    ruleRow(`synthetic-${ref}`, (i += 1), desc, n, p);
  const manyPortions = [
    ...Array.from({ length: 11 }, (_, k) => slice(10 + k, k + 1, `size ${k + 1}`)),
    slice(0, 12, 'zero weight'),
    slice(6000, 13, 'too heavy'),
    { amount: 1, modifier: 'no weight', sequenceNumber: 14, measureUnit: { name: 'undetermined' } },
  ];
  return [
    r('kj-only', 'Test energy from kilojoules only', [
      N.kj(1000),
      N.protein(10),
      N.carbs(50),
      N.fat(1.5),
    ]),
    r('kcal-and-kj', 'Test energy kcal and kilojoules both present', [
      N.kcal(250),
      N.kj(1046),
      N.protein(10),
      N.carbs(50),
      N.fat(1.5),
    ]),
    r('kj-mismatch', 'Test energy units disagree', [
      N.kcal(100),
      N.kj(800),
      N.protein(5),
      N.carbs(12),
      N.fat(3.5),
    ]),
    r('unknown-vs-zero', 'Test unknown versus zero', [...base(), N.fibre(0), N.sugars(0)]),
    r('atwater-flag', 'Test energy off by about a third', base({ kcal: 230, p: 10, c: 10, f: 10 })),
    r('alcohol', 'Test alcohol skips the energy check', [
      ...base({ kcal: 150, p: 0, c: 5, f: 0 }),
      N.alcohol(20),
    ]),
    r('all-zero', 'Test all zero like water', base({ kcal: 0, p: 0, c: 0, f: 0 })),
    r('atwater-only', 'Test energy from the Atwater estimate', [
      N.atwaterGeneral(87),
      N.protein(5),
      N.carbs(10),
      N.fat(3),
    ]),
    r('sugars-over-carbs', 'Test sugars above carbohydrate', [...base(), N.sugars(11)]),
    r('satfat-over-fat', 'Test saturated fat above fat', [...base(), N.satfat(4)]),
    r('sodium-implausible', 'Test sodium far too high', [...base(), N.sodium(45000)]),
    r('missing-core', 'Test missing fat', [N.kcal(87), N.protein(5), N.carbs(10)]),
    r('negative', 'Test negative protein', base({ p: -1 })),
    r('mass-single', 'Test protein over 100 grams', base({ kcal: 404, p: 101, c: 0, f: 0 })),
    r('mass-sum', 'Test macros add up to over 105 grams', base({ kcal: 554, p: 40, c: 40, f: 26 })),
    r('energy-too-high', 'Test energy above 905', base({ kcal: 910, p: 0, c: 0, f: 100 })),
    r(
      'energy-implausible',
      'Test energy far from the macros',
      base({ kcal: 500, p: 0, c: 0, f: 5 }),
    ),
    r('no-name', '   ', base()),
    r('name-messy', '  Test   messy \t name  ', base()),
    r('name-caps', 'TEST ALL CAPS FOOD', base()),
    r('servings-many', 'Test many servings', base(), manyPortions),
    r('no-servings', 'Test no usable servings', base()),
    r('update-me', 'Test changes in version two', base()),
    r('remove-me', 'Test removed in version two', base()),
    r('break-me', 'Test fails a rule in version two', base()),
  ];
}

const fixtureMeta = (synthetic: boolean, release: string) => ({
  synthetic,
  upstreamRelease: release,
  cutDate: '2026-10-20',
  licence: synthetic
    ? 'Synthetic data written for this repository (see LICENCES.md). Not derived from any upstream database.'
    : 'U.S. Government public domain (USDA FoodData Central). See LICENCES.md.',
});

function writeJson(file: string, data: unknown) {
  writeFileSync(path.join(root, file), `${JSON.stringify(data, null, 2)}\n`);
}

const foundationV1 = ruleRows();
writeJson('usda/foundation.v1.json', {
  FoundationFoods: foundationV1,
  _fixture: fixtureMeta(true, 'synthetic rule rows (permanent) + none yet cut'),
});
writeJson('usda/foundation.v2.json', {
  FoundationFoods: deriveFoundationV2(foundationV1),
  _fixture: fixtureMeta(true, 'synthetic rule rows, version two'),
});
writeJson('usda/sr_legacy.v1.json', {
  SRLegacyFoods: goldenRecords('usda_sr_legacy'),
  _fixture: fixtureMeta(true, 'synthetic placeholders for SR Legacy (04/2018)'),
});
writeJson('usda/fndds.v1.json', {
  SurveyFoods: goldenRecords('usda_fndds'),
  _fixture: fixtureMeta(true, 'synthetic placeholders for FNDDS 2021-2023 (10/2024)'),
});

// golden list
const golden = GOLDEN_ROWS.map((row) => {
  const [k, ref, description, kcal, , , , , , , , , label, grams, flags] = row;
  const margin = Math.max(8, Math.round(kcal * 0.15));
  return {
    dataset: DATASET_OF[k],
    sourceRef: ref,
    referenceName: description,
    kcalRange: [Math.max(0, kcal - margin), kcal + margin],
    ...(label === null || grams === null
      ? {}
      : {
          expectedServingLabel: label,
          expectedServingGrams: [
            Math.round(grams * 0.7 * 10) / 10,
            Math.round(grams * 1.3 * 10) / 10,
          ],
        }),
    ...(flags.includes('it') ? { group: 'italian' } : {}),
    ...(flags.includes('opt') ? { optional: true } : {}),
  };
});
writeJson('golden-list.json', golden);

const meta = (file: string, release: string) => ({
  [file]: `${release}; synthetic; see LICENCES.md`,
});
const manifest = (version: 'v1' | 'v2') => ({
  mode: 'full',
  inputs: [
    {
      dataset: 'usda_foundation',
      path: `usda/foundation.${version}.json`,
      releaseLabel: `fixture-foundation-${version}`,
      snapshot: true,
    },
    {
      dataset: 'usda_sr_legacy',
      path: 'usda/sr_legacy.v1.json',
      releaseLabel: 'fixture-sr-legacy',
      snapshot: true,
    },
    {
      dataset: 'usda_fndds',
      path: 'usda/fndds.v1.json',
      releaseLabel: 'fixture-fndds',
      snapshot: true,
    },
  ],
  meta: {
    provenance:
      'synthetic placeholders until pnpm food:cut-fixture replaces them with real USDA records (H1)',
    licence: 'USDA data: U.S. Government public domain. Synthetic rows: ours. See LICENCES.md',
    ...meta('usda/foundation', 'synthetic rule rows'),
  },
});
writeJson('manifest.v1.json', manifest('v1'));
writeJson('manifest.v2.json', manifest('v2'));
console.log(`golden entries: ${golden.length}`);
