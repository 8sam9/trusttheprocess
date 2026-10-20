import type { FoodRow } from '@ttp/shared';
import {
  FoodDataError,
  __setFoodClientForTests,
  getFoods,
  hasSeparateFoodProject,
  includeOff,
  lookupBarcode,
  resolveFoodClient,
  searchFoods,
  type FoodRpcClient,
} from './foodData';

jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn() } }));

const ID_A = '6f1c1b0e-7a53-5d0a-9a0e-0c1f1c1b0e7a';
const ID_B = '0b9e5f56-3c63-5d0f-8a43-1a2b3c4d5e6f';

function row(overrides: Partial<FoodRow> = {}): FoodRow {
  return {
    id: ID_A,
    source: 'usda',
    dataset: 'usda_foundation',
    source_ref: '123456',
    name: 'Egg, whole, raw',
    name_lang: 'en',
    alt_names: null,
    brand: null,
    barcode: null,
    kcal: 143,
    protein_g: 12.6,
    carbs_g: 0.7,
    fat_g: 9.5,
    fibre_g: null,
    sugars_g: 0.4,
    satfat_g: 0,
    sodium_mg: 142,
    carbs_basis: 'total',
    tier: 'verified',
    reasons: [],
    hidden: false,
    is_canonical: true,
    servings: [{ label: '1 large', grams: 50 }],
    updated_at: '2026-10-20T10:00:00+00:00',
    ...overrides,
  };
}

function checkDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const fromRight = body.length - 1 - i;
    sum += Number(body[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

const UPC_A = '036000291452';
const EAN_13 = '0036000291452';
const GTIN_14 = '00036000291452';
const IN_STORE = `2${'1234567890'.slice(0, 11)}`.padEnd(12, '0');
const IN_STORE_EAN13 = IN_STORE + checkDigit(IN_STORE);

let rpc: jest.Mock;

beforeEach(() => {
  rpc = jest.fn().mockResolvedValue({ data: [], error: null });
  __setFoodClientForTests({ rpc } as FoodRpcClient);
});

afterEach(() => __setFoodClientForTests(undefined));

describe('getFoods', () => {
  it('calls get_foods and parses FoodRow results, hidden included', async () => {
    rpc.mockResolvedValue({ data: [row(), row({ id: ID_B, hidden: true })], error: null });
    const rows = await getFoods([ID_A, ID_B]);
    expect(rpc).toHaveBeenCalledWith('get_foods', { p_ids: [ID_A, ID_B], p_include_off: false });
    expect(rows.map((r) => r.hidden)).toEqual([false, true]);
    expect(rows[0]?.servings).toEqual([{ label: '1 large', grams: 50 }]);
  });

  it('makes no call for an empty list', async () => {
    await expect(getFoods([])).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects non-uuid ids and more than 200 ids without calling', async () => {
    await expect(getFoods(['nope'])).rejects.toMatchObject({ code: 'invalid_args' });
    const many = Array.from({ length: 201 }, () => ID_A);
    await expect(getFoods(many)).rejects.toBeInstanceOf(FoodDataError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps server error codes', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'too_many_ids' } });
    await expect(getFoods([ID_A])).rejects.toMatchObject({ code: 'too_many_ids' });
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getFoods([ID_A])).rejects.toMatchObject({ code: 'request_failed' });
  });
});

describe('FoodRow parsing', () => {
  it('keeps null (unknown) distinct from 0 (known zero)', async () => {
    rpc.mockResolvedValue({ data: [row({ fibre_g: null, satfat_g: 0 })], error: null });
    const [r] = await getFoods([ID_A]);
    expect(r?.fibre_g).toBeNull();
    expect(r?.satfat_g).toBe(0);
  });

  it('accepts soft flags in reasons', async () => {
    rpc.mockResolvedValue({
      data: [row({ reasons: ['energy_from_kj'], tier: 'community' })],
      error: null,
    });
    const [r] = await getFoods([ID_A]);
    expect(r?.reasons).toEqual(['energy_from_kj']);
  });

  it('rejects a hide reason in reasons (soft flags only)', async () => {
    rpc.mockResolvedValue({ data: [{ ...row(), reasons: ['superseded'] }], error: null });
    await expect(getFoods([ID_A])).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('rejects malformed rows and treats null data as empty', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'x' }], error: null });
    await expect(getFoods([ID_A])).rejects.toMatchObject({ code: 'invalid_response' });
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(getFoods([ID_A])).resolves.toEqual([]);
  });
});

describe('lookupBarcode', () => {
  it.each([
    ['UPC-A', UPC_A],
    ['EAN-13', EAN_13],
    ['GTIN-14', GTIN_14],
    ['with spaces', ' 0 36000 29145 2 '],
  ])('normalises %s to the GTIN-14 key before the call', async (_label, raw) => {
    rpc.mockResolvedValue({ data: [row({ barcode: GTIN_14 })], error: null });
    const found = await lookupBarcode(raw);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('lookup_barcode', { p_gtin14: GTIN_14, p_include_off: false });
    expect(found?.barcode).toBe(GTIN_14);
  });

  it('returns null when nothing matches', async () => {
    await expect(lookupBarcode(UPC_A)).resolves.toBeNull();
  });

  it('returns null without a call for invalid codes', async () => {
    for (const bad of ['', 'abc', '12345', '036000291453', '123456789012345']) {
      await expect(lookupBarcode(bad)).resolves.toBeNull();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns null without a call for restricted in-store codes', async () => {
    await expect(lookupBarcode(IN_STORE_EAN13)).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('searchFoods', () => {
  it('trims the query and passes the limit', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const rows = await searchFoods('  egg ', 10);
    expect(rpc).toHaveBeenCalledWith('search_foods', {
      p_query: 'egg',
      p_limit: 10,
      p_include_off: false,
    });
    expect(rows).toHaveLength(1);
  });

  it('omits p_limit when not given', async () => {
    await searchFoods('egg');
    expect(rpc).toHaveBeenCalledWith('search_foods', { p_query: 'egg', p_include_off: false });
  });

  it.each([
    ['blank query', '   ', undefined],
    ['query over 100 chars', 'a'.repeat(101), undefined],
    ['limit 0', 'egg', 0],
    ['limit 51', 'egg', 51],
    ['fractional limit', 'egg', 2.5],
  ])('rejects %s without calling', async (_label, q, limit) => {
    await expect(searchFoods(q, limit)).rejects.toMatchObject({ code: 'invalid_args' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('OFF gate (AC 44)', () => {
  it('is off by default and drops any OFF row that slips through', async () => {
    expect(includeOff).toBe(false);
    rpc.mockResolvedValue({
      data: [row(), row({ id: ID_B, source: 'off', dataset: 'off', tier: 'community' })],
      error: null,
    });
    const rows = await searchFoods('egg');
    expect(rows.map((r) => r.source)).toEqual(['usda']);
  });
});

describe('env switch', () => {
  const fallback = { rpc: jest.fn() } as FoodRpcClient;

  it('uses the main client when the variables are unset or partial', () => {
    const create = jest.fn();
    expect(resolveFoodClient({}, fallback, create)).toBe(fallback);
    expect(resolveFoodClient({ url: 'https://food.example' }, fallback, create)).toBe(fallback);
    expect(resolveFoodClient({ key: 'k' }, fallback, create)).toBe(fallback);
    expect(resolveFoodClient({ url: ' ', key: 'k' }, fallback, create)).toBe(fallback);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a dedicated client when both are set', () => {
    const dedicated = { rpc: jest.fn() } as FoodRpcClient;
    const create = jest.fn().mockReturnValue(dedicated);
    expect(resolveFoodClient({ url: ' https://food.example ', key: 'pk' }, fallback, create)).toBe(
      dedicated,
    );
    expect(create).toHaveBeenCalledWith('https://food.example', 'pk');
    expect(hasSeparateFoodProject({ url: 'u', key: 'k' })).toBe(true);
  });

  it('builds a real client without throwing by default', () => {
    const client = resolveFoodClient({ url: 'https://food.example', key: 'pk' }, fallback);
    expect(client).not.toBe(fallback);
    expect(typeof client.rpc).toBe('function');
  });
});
