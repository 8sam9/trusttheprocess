import { describe, expect, it } from 'vitest';
import { portionLabel, usdaServingCandidates } from './portions.js';
import type { UsdaPortion } from './schemas.js';

const p = (over: Partial<UsdaPortion>): UsdaPortion => ({ ...over }) as UsdaPortion;

describe('portion labels (AC 18)', () => {
  it('SR Legacy style: amount + unit + modifier', () => {
    expect(portionLabel(p({ amount: 1, measureUnit: { name: 'cup' }, modifier: 'sliced' }))).toBe(
      '1 cup, sliced',
    );
    expect(
      portionLabel(p({ amount: 0.5, measureUnit: { name: 'cup' }, modifier: 'chopped' })),
    ).toBe('0.5 cup, chopped');
    expect(portionLabel(p({ amount: 3, measureUnit: { name: 'oz' } }))).toBe('3 oz');
  });
  it('undetermined unit is omitted: "1 large", "1 slice"', () => {
    expect(
      portionLabel(p({ amount: 1, measureUnit: { name: 'undetermined' }, modifier: 'large' })),
    ).toBe('1 large');
    expect(portionLabel(p({ measureUnit: { name: 'UNDETERMINED' }, modifier: 'slice' }))).toBe(
      '1 slice',
    );
  });
  it('FNDDS style: portionDescription is the full label; the placeholder and numeric modifier codes are ignored', () => {
    expect(portionLabel(p({ portionDescription: '1 cup, chopped', modifier: '10205' }))).toBe(
      '1 cup, chopped',
    );
    expect(
      portionLabel(p({ portionDescription: 'Quantity not specified', modifier: '10205' })),
    ).toBeNull();
    expect(portionLabel(p({ amount: 1, measureUnit: { name: 'cup' }, modifier: '10205' }))).toBe(
      '1 cup',
    );
  });
  it('nothing to say means no label', () => {
    expect(portionLabel(p({ amount: 1, measureUnit: { name: 'undetermined' } }))).toBeNull();
    expect(portionLabel(p({}))).toBeNull();
  });
  it('orders by sequenceNumber, then upstream order; keeps gram weights', () => {
    const out = usdaServingCandidates([
      p({ sequenceNumber: 2, portionDescription: 'b', gramWeight: 2 }),
      p({ portionDescription: 'z', gramWeight: 9 }),
      p({ sequenceNumber: 1, portionDescription: 'a', gramWeight: 1 }),
    ]);
    expect(out).toEqual([
      { label: 'a', grams: 1 },
      { label: 'b', grams: 2 },
      { label: 'z', grams: 9 },
    ]);
  });
});
