import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FoodDataset, FoodSource } from '@ttp/shared';
import type { ManifestInput } from '../schemas/manifest.js';
import type { ImporterConfig } from '../schemas/config.js';
import type { FoodOutcome, ParseFailure } from '../types.js';
import { readUsdaGeneric, streamUsdaRecords, UsdaFormatError } from '../usda/reader.js';
import { UsdaGenericFood, isUsdaGenericDataset } from '../usda/schemas.js';
import { ImportError } from './errors.js';

export function datasetSource(dataset: FoodDataset): FoodSource {
  return dataset === 'off' ? 'off' : 'usda';
}

export interface InputReader {
  /** Cheap checks before anything is written (AC 5, 38). Throws ImportError('bad_input'). */
  preflight(): Promise<void>;
  read(): AsyncGenerator<FoodOutcome | ParseFailure>;
}

/** Files named after OFF's sibling projects are refused up front (AC 5). */
const NON_FOOD_FILE = /(openbeautyfacts|openpetfoodfacts|openproductsfacts)/i;

/** Same threshold as the run itself: a pinned-shape mismatch above this share stops the run. */
export const PARSE_ERROR_LIMIT = 0.01;
const PREFLIGHT_RECORDS = 1000;

export function openInput(input: ManifestInput, file: string, config: ImporterConfig): InputReader {
  const { dataset } = input;
  if (dataset === 'off' && NON_FOOD_FILE.test(path.basename(file))) {
    throw new ImportError(
      'bad_input',
      `${file} looks like a non-food Open Food Facts file (cosmetics, pet food or other products); this importer only reads the food file. Nothing was written.`,
    );
  }
  if (!isUsdaGenericDataset(dataset)) {
    throw new ImportError(
      'bad_input',
      `dataset ${dataset} is not supported by this version (USDA Branded and Open Food Facts arrive with spec 002b). Nothing was written.`,
    );
  }

  return {
    async preflight() {
      try {
        await stat(file);
      } catch {
        throw new ImportError('bad_input', `input file not found: ${file}. Nothing was written.`);
      }
      let checked = 0;
      let failed = 0;
      let firstIssue = '';
      try {
        for await (const raw of streamUsdaRecords(file, dataset)) {
          const parsed = UsdaGenericFood.safeParse(raw);
          if (!parsed.success) {
            failed += 1;
            if (firstIssue === '') {
              const issue = parsed.error.issues[0];
              firstIssue = `record ${checked} field "${issue?.path.join('.') || '(record)'}": ${issue?.message ?? 'invalid'}`;
            }
          }
          checked += 1;
          if (checked >= PREFLIGHT_RECORDS) break;
        }
      } catch (e) {
        if (e instanceof UsdaFormatError) {
          throw new ImportError('bad_input', `${e.message}. Nothing was written.`);
        }
        throw e;
      }
      if (checked === 0) {
        throw new ImportError('bad_input', `${file} holds no records. Nothing was written.`);
      }
      if (failed / checked > PARSE_ERROR_LIMIT) {
        throw new ImportError(
          'bad_input',
          `${file}: ${failed} of the first ${checked} records do not match the expected ${dataset} shape (first: ${firstIssue}). The upstream format may have changed; update src/usda/schemas.ts. Nothing was written.`,
        );
      }
    },
    read() {
      return readUsdaGeneric(file, dataset, config.rules);
    },
  };
}
