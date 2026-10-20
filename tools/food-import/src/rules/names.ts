/**
 * Name normalisation (AC 17). Names are only cleaned, never rewritten, translated or shortened beyond the
 * length limit. Brand is stored separately by the caller.
 */

export type NameKind = 'name' | 'brand';

function collapse(raw: string): string {
  // NFC so "Creme" typed with a combining accent equals the precomposed form; \s covers tabs and newlines.
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** At least 4 letters and no lower-case letter. Short codes ("USDA", "BBQ") are left alone. */
export function isAllCaps(s: string): boolean {
  const letters = s.match(/\p{L}/gu);
  return letters !== null && letters.length >= 4 && !/\p{Ll}/u.test(s);
}

function sentenceCase(s: string): string {
  const lower = s.toLocaleLowerCase('en');
  const chars = Array.from(lower);
  const i = chars.findIndex((c) => /\p{L}/u.test(c));
  if (i === -1) return lower;
  chars[i] = (chars[i] ?? '').toLocaleUpperCase('en');
  return chars.join('');
}

function titleCase(s: string): string {
  return s
    .toLocaleLowerCase('en')
    .replace(
      /(^|[\s\-/(&])(\p{L})/gu,
      (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('en'),
    );
}

function truncateCodePoints(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join('').trimEnd();
}

/** Returns null when the result is empty (the caller rejects the row as `no_name`). */
export function normaliseName(
  raw: string | null | undefined,
  kind: NameKind,
  maxCodePoints: number,
): string | null {
  if (raw === null || raw === undefined) return null;
  let s = collapse(raw);
  if (s === '') return null;
  if (isAllCaps(s)) s = kind === 'brand' ? titleCase(s) : sentenceCase(s);
  s = truncateCodePoints(s, maxCodePoints);
  return s === '' ? null : s;
}
