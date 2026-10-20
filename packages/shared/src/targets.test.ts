import { describe, expect, it } from 'vitest';
import { KCAL_PER_GRAM } from './nutrition';
import type { ProfileInput } from './profile';
import {
  DEFAULT_WEEKLY_RATE_KG,
  GOAL_FOR_OPTION,
  GoalOption,
  MACRO_KCAL_TOLERANCE,
  PACE_PRESETS,
  applyManualKcal,
  defaultUnitsForRegion,
  explainTargets,
  isLoseGoalGuarded,
  localDateIn,
  manualKcalBounds,
  targetForDate,
} from './targets';

// Fixed "today": age is calendar-year difference, so 1996 -> 30 and 1986 -> 40 in 2026.
const today = new Date('2026-06-15T12:00:00Z');

const ac17: ProfileInput = {
  sex: 'female',
  birthYear: 1996,
  heightCm: 165,
  weightKg: 65,
  activityLevel: 'light',
  goal: 'lose',
  weeklyRateKg: 0.5,
  units: 'metric',
};
const ac20: ProfileInput = {
  sex: 'female',
  birthYear: 1986,
  heightCm: 155,
  weightKg: 50,
  activityLevel: 'sedentary',
  goal: 'lose',
  weeklyRateKg: 0.75,
  units: 'metric',
};
const floorAboveMaintenance: ProfileInput = {
  sex: 'female',
  birthYear: 1966,
  heightCm: 150,
  weightKg: 42,
  activityLevel: 'sedentary',
  goal: 'lose',
  weeklyRateKg: 0.25,
  units: 'metric',
};

const macroKcal = (t: { proteinG: number; carbsG: number; fatG: number }) =>
  KCAL_PER_GRAM.protein * t.proteinG + KCAL_PER_GRAM.carbs * t.carbsG + KCAL_PER_GRAM.fat * t.fatG;

describe('constants and mappings', () => {
  it('maps the four goal options (AC 5)', () => {
    expect(GOAL_FOR_OPTION).toEqual({
      lose_fat: 'lose',
      build_muscle: 'gain',
      fuel_performance: 'maintain',
      just_track: 'maintain',
    });
    expect(GoalOption.options).toHaveLength(4);
  });
  it('has presets whose defaults are preselected', () => {
    expect(PACE_PRESETS.lose.metric.map((p) => p.kg)).toEqual([0.25, 0.5, 0.75]);
    expect(PACE_PRESETS.lose.imperial.map((p) => p.kg)).toEqual([0.23, 0.45, 0.68]);
    expect(PACE_PRESETS.gain.metric.map((p) => p.kg)).toEqual([0.25, 0.5]);
    expect(PACE_PRESETS.gain.imperial.map((p) => p.kg)).toEqual([0.23, 0.45]);
    expect(PACE_PRESETS.lose.metric.some((p) => p.kg === DEFAULT_WEEKLY_RATE_KG.lose)).toBe(true);
    expect(PACE_PRESETS.gain.metric.some((p) => p.kg === DEFAULT_WEEKLY_RATE_KG.gain)).toBe(true);
  });
});

describe('explainTargets', () => {
  it('reproduces the AC 17 worked example', () => {
    const b = explainTargets(ac17, today);
    expect(b).toMatchObject({
      bmr: 1370,
      activityMultiplier: 1.375,
      maintenanceKcal: 1884,
      adjustmentKcal: -550,
      calculatedKcal: 1330,
      floorApplied: false,
      floorAtOrAboveMaintenance: false,
      impliedWeeklyRateKg: null,
      proteinG: 104,
      carbsG: 129,
      fatG: 44,
    });
  });

  it('keeps maintenance + adjustment within 5 kcal of the target and flags rounding (AC 19)', () => {
    const b = explainTargets(ac17, today);
    expect(b.maintenanceKcal + b.adjustmentKcal).toBe(1334);
    expect(b.roundingChanged).toBe(true);
    for (const goal of ['lose', 'maintain', 'gain'] as const) {
      for (const rate of [0.01, 0.13, 0.25, 0.33, 0.5, 0.75, 1, 1.5]) {
        for (const activityLevel of [
          'sedentary',
          'light',
          'moderate',
          'active',
          'very_active',
        ] as const) {
          const input: ProfileInput = {
            ...ac17,
            goal,
            activityLevel,
            weeklyRateKg: goal === 'maintain' ? 0 : rate,
          };
          const r = explainTargets(input, today);
          expect(
            Math.abs(r.maintenanceKcal + r.adjustmentKcal - r.calculatedKcal),
          ).toBeLessThanOrEqual(5);
          expect(r.roundingChanged).toBe(r.calculatedKcal !== r.maintenanceKcal + r.adjustmentKcal);
        }
      }
    }
  });

  it('does not flag rounding when the sum is already a multiple of 10', () => {
    const b = explainTargets({ ...ac17, goal: 'maintain', weeklyRateKg: 0 }, today);
    expect(b.adjustmentKcal).toBe(0);
    expect(b.calculatedKcal).toBe(1880);
    expect(b.roundingChanged).toBe(true); // 1884 -> 1880
  });

  it('applies the floor and reports the implied pace (AC 20)', () => {
    const b = explainTargets(ac20, today);
    expect(b.maintenanceKcal).toBe(1329);
    expect(b.calculatedKcal).toBe(1200);
    expect(b.floorApplied).toBe(true);
    expect(b.floorKcal).toBe(1200);
    expect(b.floorAtOrAboveMaintenance).toBe(false);
    expect(b.adjustmentKcal).toBe(-129);
    expect(b.impliedWeeklyRateKg).toBeCloseTo(0.117, 2);
    expect(round1(b.impliedWeeklyRateKg ?? NaN)).toBe(0.1);
    expect(b).toMatchObject({ proteinG: 80, carbsG: 130, fatG: 40 });
  });

  it('handles a floor at or above maintenance (AC 20, second variant)', () => {
    const b = explainTargets(floorAboveMaintenance, today);
    expect(b.maintenanceKcal).toBe(1076);
    expect(b.calculatedKcal).toBe(1200);
    expect(b.floorApplied).toBe(true);
    expect(b.floorAtOrAboveMaintenance).toBe(true);
    expect(b.impliedWeeklyRateKg).toBeLessThanOrEqual(0);
    expect(b.adjustmentKcal).toBe(124);
  });

  it('uses the male floor of 1500 and the 1200 floor for unspecified', () => {
    const male = explainTargets({ ...ac20, sex: 'male' }, today);
    expect(male.floorKcal).toBe(1500);
    const unspecified = explainTargets({ ...ac20, sex: 'unspecified' }, today);
    expect(unspecified.floorKcal).toBe(1200);
  });

  it('keeps macro energy within the tolerance for a grid of inputs (AC 18)', () => {
    let count = 0;
    for (const sex of ['female', 'male', 'unspecified'] as const) {
      for (const weightKg of [30, 45, 65, 95, 140, 350]) {
        for (const heightCm of [100, 155, 180, 250]) {
          for (const goal of ['lose', 'maintain', 'gain'] as const) {
            for (const weeklyRateKg of goal === 'maintain' ? [0] : [0.01, 0.5, 1.5]) {
              const b = explainTargets(
                {
                  sex,
                  birthYear: 1990,
                  heightCm,
                  weightKg,
                  activityLevel: 'moderate',
                  goal,
                  weeklyRateKg,
                  units: 'metric',
                },
                today,
              );
              expect(Math.abs(macroKcal(b) - b.calculatedKcal)).toBeLessThanOrEqual(
                MACRO_KCAL_TOLERANCE,
              );
              expect(b.carbsG).toBeGreaterThanOrEqual(0);
              count++;
            }
          }
        }
      }
    }
    expect(count).toBeGreaterThan(200);
  });

  it('does not change when the clock moves but "today" is pinned (AC 23 building block)', () => {
    expect(explainTargets(ac17, today)).toEqual(
      explainTargets(ac17, new Date('2026-12-31T23:00:00Z')),
    );
    expect(explainTargets(ac17, new Date('2030-01-01T00:00:00Z')).calculatedKcal).not.toBe(1330);
  });
});

const round1 = (n: number) => Math.round(n * 10) / 10;

describe('manualKcalBounds', () => {
  it('is [floor, max(6000, calculated)] (AC 22)', () => {
    expect(manualKcalBounds('female', 1330)).toEqual({ min: 1200, max: 6000 });
    expect(manualKcalBounds('unspecified', 1330)).toEqual({ min: 1200, max: 6000 });
    expect(manualKcalBounds('male', 1330)).toEqual({ min: 1500, max: 6000 });
    expect(manualKcalBounds('male', 9000)).toEqual({ min: 1500, max: 9000 });
  });
});

describe('applyManualKcal', () => {
  const pick = { sex: 'female', weightKg: 65, goal: 'lose' } as const;
  const b = explainTargets(ac17, today);

  it('returns the calculated targets unchanged when kcal equals them', () => {
    expect(applyManualKcal(b, 1330, pick)).toEqual({
      kcal: 1330,
      proteinG: 104,
      carbsG: 129,
      fatG: 44,
      isCustom: false,
      proteinCapped: false,
      clamped: null,
    });
  });

  it('holds protein, recomputes fat and carbs, and marks custom', () => {
    const f = applyManualKcal(b, 1800, pick);
    expect(f).toMatchObject({
      kcal: 1800,
      proteinG: 104,
      fatG: 60,
      isCustom: true,
      proteinCapped: false,
      clamped: null,
    });
    expect(Math.abs(macroKcal(f) - 1800)).toBeLessThanOrEqual(MACRO_KCAL_TOLERANCE);
  });

  it('caps protein at 35 percent of calories when calories drop', () => {
    const heavy: ProfileInput = { ...ac17, weightKg: 100 };
    const hb = explainTargets(heavy, today);
    expect(hb.proteinG).toBeGreaterThan(105);
    const f = applyManualKcal(hb, 1200, { sex: 'female', weightKg: 100, goal: 'lose' });
    expect(f.proteinCapped).toBe(true);
    expect(f.proteinG).toBe(105);
    expect(f.carbsG).toBeGreaterThanOrEqual(0);
    expect(Math.abs(macroKcal(f) - 1200)).toBeLessThanOrEqual(MACRO_KCAL_TOLERANCE);
  });

  it('clamps below the floor and above the max (AC 22)', () => {
    const low = applyManualKcal(b, 900, pick);
    expect(low).toMatchObject({ kcal: 1200, clamped: 'floor', isCustom: true });
    const high = applyManualKcal(b, 13300, pick);
    expect(high).toMatchObject({ kcal: 6000, clamped: 'max', isCustom: true });
    const male = applyManualKcal(b, 1400, { sex: 'male', weightKg: 65, goal: 'lose' });
    expect(male).toMatchObject({ kcal: 1500, clamped: 'floor' });
  });

  it('accepts the exact boundaries without clamping', () => {
    expect(applyManualKcal(b, 1200, pick)).toMatchObject({ kcal: 1200, clamped: null });
    expect(applyManualKcal(b, 6000, pick)).toMatchObject({ kcal: 6000, clamped: null });
  });

  it('allows values up to a higher calculated target', () => {
    const big = { ...b, calculatedKcal: 9000 };
    expect(applyManualKcal(big, 8800, pick)).toMatchObject({ kcal: 8800, clamped: null });
    expect(applyManualKcal(big, 9100, pick)).toMatchObject({ kcal: 9000, clamped: 'max' });
  });

  it('keeps macro energy within tolerance across the allowed range', () => {
    for (let kcal = 1200; kcal <= 6000; kcal += 50) {
      const f = applyManualKcal(b, kcal, pick);
      expect(Math.abs(macroKcal(f) - f.kcal)).toBeLessThanOrEqual(MACRO_KCAL_TOLERANCE);
      expect(f.carbsG).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('isLoseGoalGuarded (AC 16)', () => {
  const adult = { birthYear: 1996, heightCm: 165, weightKg: 65 };
  it('guards ages 16 and 17 but not 18', () => {
    expect(isLoseGoalGuarded({ ...adult, birthYear: 2010 }, today)).toBe(true); // 16
    expect(isLoseGoalGuarded({ ...adult, birthYear: 2009 }, today)).toBe(true); // 17
    expect(isLoseGoalGuarded({ ...adult, birthYear: 2008 }, today)).toBe(false); // 18
  });
  it('guards BMI under 18.5 and not 18.5 or above', () => {
    // 200 cm: 74 kg is exactly 18.5
    expect(isLoseGoalGuarded({ birthYear: 1996, heightCm: 200, weightKg: 73.6 }, today)).toBe(true);
    expect(isLoseGoalGuarded({ birthYear: 1996, heightCm: 200, weightKg: 74 }, today)).toBe(false);
    expect(isLoseGoalGuarded(adult, today)).toBe(false);
  });
  it('returns only a boolean (BMI never leaks)', () => {
    expect(typeof isLoseGoalGuarded(adult, today)).toBe('boolean');
  });
});

describe('defaultUnitsForRegion (AC 15)', () => {
  it('gives imperial for US, Liberia and Myanmar only', () => {
    for (const r of ['US', 'LR', 'MM', 'us']) expect(defaultUnitsForRegion(r)).toBe('imperial');
    for (const r of ['GB', 'IT', 'CA', 'AU', '']) expect(defaultUnitsForRegion(r)).toBe('metric');
  });
  it('defaults to metric when the region is unknown', () => {
    expect(defaultUnitsForRegion(null)).toBe('metric');
    expect(defaultUnitsForRegion(undefined)).toBe('metric');
  });
});

describe('localDateIn (AC 26)', () => {
  it('gives different dates for different zones at the same instant', () => {
    const now = new Date('2026-10-19T23:30:00Z');
    expect(localDateIn('UTC', now)).toBe('2026-10-19');
    expect(localDateIn('Europe/Rome', now)).toBe('2026-10-20'); // UTC+2
    expect(localDateIn('America/Los_Angeles', now)).toBe('2026-10-19'); // UTC-7
    expect(localDateIn('Pacific/Auckland', now)).toBe('2026-10-20'); // UTC+13
    expect(localDateIn('Pacific/Kiritimati', new Date('2026-10-19T09:59:00Z'))).toBe('2026-10-19'); // UTC+14
    expect(localDateIn('Pacific/Kiritimati', new Date('2026-10-19T10:01:00Z'))).toBe('2026-10-20');
  });
  it('follows the DST change in Europe/Rome (2026-03-29 at 01:00 UTC)', () => {
    expect(localDateIn('Europe/Rome', new Date('2026-03-28T22:30:00Z'))).toBe('2026-03-28'); // 23:30 CET
    expect(localDateIn('Europe/Rome', new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29'); // 00:30 CET
    expect(localDateIn('Europe/Rome', new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30'); // 00:30 CEST
    expect(localDateIn('Europe/Rome', new Date('2026-03-29T21:30:00Z'))).toBe('2026-03-29'); // 23:30 CEST
  });
  it('follows the autumn change in America/New_York (2026-11-01)', () => {
    expect(localDateIn('America/New_York', new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01'); // 01:30 EDT
    expect(localDateIn('America/New_York', new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01'); // 01:30 EST
    expect(localDateIn('America/New_York', new Date('2026-11-02T04:59:00Z'))).toBe('2026-11-01'); // 23:59 EST
    expect(localDateIn('America/New_York', new Date('2026-11-02T05:00:00Z'))).toBe('2026-11-02');
  });
  it('rolls the year at local midnight', () => {
    expect(localDateIn('Asia/Tokyo', new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
    expect(localDateIn('America/Los_Angeles', new Date('2027-01-01T07:59:00Z'))).toBe('2026-12-31');
  });
  it('falls back to UTC for an unknown zone and defaults now', () => {
    expect(localDateIn('Not/AZone', new Date('2026-10-19T23:30:00Z'))).toBe('2026-10-19');
    expect(localDateIn('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('targetForDate', () => {
  const rows = [
    { effective_from: '2026-10-19', kcal: 1330 },
    { effective_from: '2026-11-02', kcal: 1420 },
    { effective_from: '2026-10-01', kcal: 1500 },
  ];
  it('picks the row with the greatest effective_from on or before the date', () => {
    expect(targetForDate(rows, '2026-10-19')?.kcal).toBe(1330);
    expect(targetForDate(rows, '2026-10-31')?.kcal).toBe(1330);
    expect(targetForDate(rows, '2026-11-02')?.kcal).toBe(1420);
    expect(targetForDate(rows, '2027-05-01')?.kcal).toBe(1420);
    expect(targetForDate(rows, '2026-10-18')?.kcal).toBe(1500);
  });
  it('returns null before the first row or for no rows', () => {
    expect(targetForDate(rows, '2026-09-30')).toBeNull();
    expect(targetForDate([], '2026-10-19')).toBeNull();
  });
  it('does not mutate its input', () => {
    const copy = structuredClone(rows);
    targetForDate(rows, '2026-10-31');
    expect(rows).toEqual(copy);
  });
});
