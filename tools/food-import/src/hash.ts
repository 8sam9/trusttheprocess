import { createHash } from 'node:crypto';
import type { NormalisedFood } from './types.js';

/** JSON with recursively sorted keys; numbers use JavaScript's shortest round-trip form, so it is deterministic. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/**
 * Change-detection hash (ADR 0007 point 4): first 8 bytes of SHA-256 over the canonical JSON of every
 * upstream-derived column. Ids, run, release and timestamps are not part of it. Returned as the decimal string of
 * the signed 64-bit integer stored in `food.foods.content_hash` (bigint).
 */
export function contentHash(food: NormalisedFood): string {
  const rest = Object.fromEntries(Object.entries(food).filter(([key]) => key !== 'id'));
  const digest = createHash('sha256').update(canonicalJson(rest)).digest();
  return digest.readBigInt64BE(0).toString();
}
