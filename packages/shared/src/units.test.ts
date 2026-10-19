import { describe, expect, it } from 'vitest';
import { cmToFtIn, ftInToCm, kgToLb, lbToKg, round } from './units';

describe('units', () => {
  it('round-trips kg ↔ lb', () => {
    expect(round(kgToLb(lbToKg(176)), 6)).toBe(176);
    expect(round(lbToKg(1), 8)).toBe(0.45359237);
  });
  it('converts height', () => {
    expect(cmToFtIn(180)).toEqual({ ft: 5, in: 11 });
    expect(round(ftInToCm(6, 0), 2)).toBe(182.88);
  });
  it('rounds without float artefacts', () => {
    expect(round(1.005, 2)).toBe(1.01);
  });
});
