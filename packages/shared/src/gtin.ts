/**
 * GTIN normalisation (spec 002, T6.1; AC 14 to 16). Pure, no I/O.
 * Every accepted code is left-padded to a 14-digit key so that UPC-A, EAN-13 and GTIN-14 forms of the same
 * product compare equal. UPC-E expansion is deliberately not done (risk R6).
 */

export type GtinKind = 'gtin8' | 'gtin12' | 'gtin13' | 'gtin14';

export type GtinFailureReason = 'non_numeric' | 'bad_length' | 'bad_check_digit';

export type NormalisedGtin =
  | { ok: true; gtin14: string; restricted: boolean; kind: GtinKind }
  | { ok: false; reason: GtinFailureReason };

/** GS1 mod-10 check: weights 3,1,3,1... from the right, starting with the digit left of the check digit. */
function hasValidCheckDigit(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i += 1) {
    const fromRight = digits.length - 2 - i;
    const weight = fromRight % 2 === 0 ? 3 : 1;
    sum += Number(digits[i]) * weight;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(digits[digits.length - 1]);
}

/**
 * True for codes that stores assign to themselves or that are not products (never linked across sources, never
 * returned by a barcode lookup). Takes a normalised 14-digit key.
 *
 * - GTIN-8 (key starts with six zeros): restricted when it starts with 0 or 2 (company RCN-8).
 * - Otherwise the key is `0` + GTIN-13 and the GTIN-13 prefix is checked: 020-029, 040-049, 200-299,
 *   980, 981-984 and 99.
 * - GTIN-14 with a non-zero indicator digit is not restricted (T6.1: case-level codes are valid and kept).
 */
export function isRestrictedGtin14(g: string): boolean {
  if (!/^[0-9]{14}$/.test(g)) return false;

  if (g.startsWith('000000')) {
    const first = g[6];
    return first === '0' || first === '2';
  }

  if (g[0] !== '0') return false;
  const gtin13 = g.slice(1);
  const p2 = gtin13.slice(0, 2);
  const p3 = Number(gtin13.slice(0, 3));

  if (p3 >= 20 && p3 <= 29) return true; // 020-029
  if (p3 >= 40 && p3 <= 49) return true; // 040-049
  if (p3 >= 200 && p3 <= 299) return true; // 200-299
  if (p3 >= 980 && p3 <= 984) return true; // refund receipts, coupons
  if (p2 === '99') return true; // coupons
  return false;
}

function kindOf(length: number): GtinKind {
  if (length === 8) return 'gtin8';
  if (length === 12) return 'gtin12';
  if (length === 14) return 'gtin14';
  return 'gtin13'; // 13, and 9 to 11 digits left-padded to 13 as OFF does
}

export function normaliseGtin(raw: string): NormalisedGtin {
  const stripped = raw.replace(/\s+/g, '');
  if (!/^[0-9]+$/.test(stripped)) return { ok: false, reason: 'non_numeric' };

  const length = stripped.length;
  const accepted = length === 8 || (length >= 9 && length <= 14);
  if (!accepted) return { ok: false, reason: 'bad_length' };

  const gtin14 = stripped.padStart(14, '0');
  // Leading zeros do not change the mod-10 sum, so checking the padded key checks the original code.
  if (!hasValidCheckDigit(gtin14)) return { ok: false, reason: 'bad_check_digit' };

  return { ok: true, gtin14, restricted: isRestrictedGtin14(gtin14), kind: kindOf(length) };
}
