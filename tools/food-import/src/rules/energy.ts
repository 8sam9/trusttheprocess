import type { FoodFlagCode } from '@ttp/shared';
import type { RulesConfig } from '../schemas/config.js';
import { isNum, round } from './types.js';

/** 1 kcal = 4.184 kJ (thermochemical calorie). A physical constant, not a tunable threshold. */
export const KJ_PER_KCAL = 4.184;

export interface EnergyResult {
  kcal: number | null;
  flags: FoodFlagCode[];
}

/**
 * AC 8: kcal wins when present. kJ only is converted (one decimal) and flagged `energy_from_kj`.
 * When both are present and disagree by more than 10 percent, flag `energy_unit_mismatch` (AC 21).
 */
export function resolveEnergy(
  kcal: number | null,
  kj: number | null,
  rules: RulesConfig,
): EnergyResult {
  const flags: FoodFlagCode[] = [];
  if (isNum(kcal)) {
    if (isNum(kj)) {
      const kjAsKcal = kj / KJ_PER_KCAL;
      const reference = Math.max(Math.abs(kcal), Math.abs(kjAsKcal));
      if (
        reference > 0 &&
        Math.abs(kcal - kjAsKcal) / reference > rules.energyUnitMismatchRelative
      ) {
        flags.push('energy_unit_mismatch');
      }
    }
    return { kcal, flags };
  }
  if (isNum(kj)) {
    flags.push('energy_from_kj');
    return { kcal: round(kj / KJ_PER_KCAL, 1), flags };
  }
  return { kcal: null, flags };
}
