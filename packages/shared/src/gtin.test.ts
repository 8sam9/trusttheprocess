import { describe, expect, it } from 'vitest';
import { isRestrictedGtin14, normaliseGtin } from './gtin';

/** Appends the GS1 check digit to a code body (independent of the implementation under test). */
function withCheck(body: string): string {
  const digits = [...body].map(Number).reverse();
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return body + String((10 - (sum % 10)) % 10);
}

/** A valid GTIN-13 whose first digits are `prefix`. */
function ean13(prefix: string): string {
  return withCheck(prefix.padEnd(12, '1'));
}

describe('normaliseGtin: forms (AC 14)', () => {
  it('maps UPC-A, EAN-13 and GTIN-14 of one product to the same key', () => {
    const upc = '036000291452';
    const a = normaliseGtin(upc);
    const b = normaliseGtin('0' + upc);
    const c = normaliseGtin('00' + upc);
    expect(a).toEqual({ ok: true, gtin14: '00036000291452', restricted: false, kind: 'gtin12' });
    expect(b).toEqual({ ok: true, gtin14: '00036000291452', restricted: false, kind: 'gtin13' });
    expect(c).toEqual({ ok: true, gtin14: '00036000291452', restricted: false, kind: 'gtin14' });
  });

  it('accepts a real EAN-13 and keeps leading zeros as text', () => {
    expect(normaliseGtin('4006381333931')).toEqual({
      ok: true,
      gtin14: '04006381333931',
      restricted: false,
      kind: 'gtin13',
    });
  });

  it('accepts EAN-8', () => {
    expect(normaliseGtin('96385074')).toEqual({
      ok: true,
      gtin14: '00000096385074',
      restricted: false,
      kind: 'gtin8',
    });
  });

  it('accepts a GTIN-14 with a non-zero indicator digit and keeps it', () => {
    const g = withCheck('1001234567890');
    expect(normaliseGtin(g)).toEqual({ ok: true, gtin14: g, restricted: false, kind: 'gtin14' });
  });

  it('left-pads 9 to 11 digit codes (as OFF does) when the check digit holds', () => {
    for (const len of [9, 10, 11]) {
      const code = withCheck('7'.repeat(len - 1));
      const r = normaliseGtin(code);
      expect(r).toEqual({
        ok: true,
        gtin14: code.padStart(14, '0'),
        restricted: false,
        kind: 'gtin13',
      });
    }
  });

  it('strips whitespace', () => {
    const r = normaliseGtin(' 036000 291452\n');
    expect(r.ok && r.gtin14).toBe('00036000291452');
  });
});

describe('normaliseGtin: invalid input (AC 15)', () => {
  it('rejects non-numeric characters', () => {
    expect(normaliseGtin('03600029145A')).toEqual({ ok: false, reason: 'non_numeric' });
    expect(normaliseGtin('0360-0029-1452')).toEqual({ ok: false, reason: 'non_numeric' });
    expect(normaliseGtin('')).toEqual({ ok: false, reason: 'non_numeric' });
    expect(normaliseGtin('   ')).toEqual({ ok: false, reason: 'non_numeric' });
    expect(normaliseGtin('٣٦٠٠٠٢٩١٤٥٢')).toEqual({ ok: false, reason: 'non_numeric' });
  });

  it('rejects unsupported lengths', () => {
    for (const len of [1, 5, 7, 15, 20]) {
      expect(normaliseGtin('1'.repeat(len))).toEqual({ ok: false, reason: 'bad_length' });
    }
  });

  it('rejects a wrong check digit in every accepted length', () => {
    const goods = ['96385074', '036000291452', '4006381333931', withCheck('1001234567890')];
    for (const good of goods) {
      const last = Number(good[good.length - 1]);
      const bad = good.slice(0, -1) + String((last + 1) % 10);
      expect(normaliseGtin(bad)).toEqual({ ok: false, reason: 'bad_check_digit' });
    }
  });

  it('reports non_numeric before bad_length', () => {
    expect(normaliseGtin('12ab')).toEqual({ ok: false, reason: 'non_numeric' });
  });
});

describe('restricted ranges (AC 16)', () => {
  const restricted = (prefix: string): boolean => {
    const r = normaliseGtin(ean13(prefix));
    return r.ok && r.restricted;
  };

  it.each(['020', '024', '029', '040', '045', '049', '200', '250', '299'])(
    'GTIN-13 prefix %s is restricted',
    (p) => {
      expect(restricted(p)).toBe(true);
    },
  );

  it.each(['980', '981', '982', '983', '984', '990', '995', '999'])(
    'GTIN-13 prefix %s (refund, coupons) is restricted',
    (p) => {
      expect(restricted(p)).toBe(true);
    },
  );

  it.each([
    '019',
    '030',
    '039',
    '050',
    '199',
    '300',
    '400',
    '500',
    '800',
    '979',
    '985',
    '989',
    '978',
  ])('GTIN-13 prefix %s is not restricted', (p) => {
    expect(restricted(p)).toBe(false);
  });

  it('977-979 (ISSN/ISBN) are valid and not restricted', () => {
    for (const p of ['977', '978', '979']) {
      const r = normaliseGtin(ean13(p));
      expect(r.ok).toBe(true);
      expect(r.ok && r.restricted).toBe(false);
    }
  });

  it('a 12-digit UPC-A starting with 2 or 4 is restricted (covered by 02x and 04x)', () => {
    const upc2 = withCheck('21234567890');
    const upc4 = withCheck('41234567890');
    for (const upc of [upc2, upc4]) {
      const r = normaliseGtin(upc);
      expect(r.ok && r.kind).toBe('gtin12');
      expect(r.ok && r.restricted).toBe(true);
    }
    const upc3 = normaliseGtin(withCheck('31234567890'));
    expect(upc3.ok && upc3.restricted).toBe(false);
  });

  it('the same restricted product is restricted in EAN-13 and GTIN-14 form too', () => {
    const upc = withCheck('21234567890');
    for (const form of [upc, '0' + upc, '00' + upc]) {
      const r = normaliseGtin(form);
      expect(r.ok && r.restricted).toBe(true);
    }
  });

  it('GTIN-8 starting with 0 or 2 is restricted; other starts are not', () => {
    expect(normaliseGtin(withCheck('0123456'))).toMatchObject({
      ok: true,
      kind: 'gtin8',
      restricted: true,
    });
    expect(normaliseGtin(withCheck('2123456'))).toMatchObject({
      ok: true,
      kind: 'gtin8',
      restricted: true,
    });
    for (const d of ['1', '3', '4', '5', '9']) {
      expect(normaliseGtin(withCheck(d + '123456'))).toMatchObject({
        ok: true,
        kind: 'gtin8',
        restricted: false,
      });
    }
  });

  it('GTIN-14 with a non-zero indicator is not checked against the GTIN-13 prefixes', () => {
    const g = withCheck('1200000000001');
    expect(normaliseGtin(g)).toMatchObject({ ok: true, restricted: false });
  });
});

describe('isRestrictedGtin14', () => {
  it('works directly on 14-digit keys', () => {
    expect(isRestrictedGtin14('0' + ean13('200'))).toBe(true);
    expect(isRestrictedGtin14('0' + ean13('400'))).toBe(false);
    expect(isRestrictedGtin14('00000020000008')).toBe(true);
    expect(isRestrictedGtin14('00000096385074')).toBe(false);
  });

  it('returns false for anything that is not a 14-digit string', () => {
    expect(isRestrictedGtin14('')).toBe(false);
    expect(isRestrictedGtin14('2000000000000')).toBe(false);
    expect(isRestrictedGtin14('0200000000000a')).toBe(false);
  });
});
