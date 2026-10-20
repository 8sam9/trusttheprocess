import { isNum, round } from './types.js';

/** Salt (g) to sodium (mg): salt / 2.5 * 1000 (AC 9). */
export const SALT_TO_SODIUM_MG_PER_G = 400;

/** AC 9: sodium wins when present (even 0); otherwise derive it from salt. Unknown stays null (AC 10). */
export function resolveSodiumMg(sodiumMg: number | null, saltG: number | null): number | null {
  if (isNum(sodiumMg)) return sodiumMg;
  if (isNum(saltG)) return round(saltG * SALT_TO_SODIUM_MG_PER_G, 3);
  return null;
}
