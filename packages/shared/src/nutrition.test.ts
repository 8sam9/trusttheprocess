import { describe, expect, it } from 'vitest';
import {
  KCAL_PER_GRAM,
  bmrMifflinStJeor,
  computeDailyTargets,
  dailyEnergyDelta,
  macroTargets,
  tdee,
} from './nutrition';
import { ProfileInput } from './profile';

const today = new Date('2026-10-19T12:00:00Z');

describe('bmrMifflinStJeor', () => {
  it('matches the published equation for a man', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(bmrMifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 })).toBe(1780);
  });
  it('matches the published equation for a woman', () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
    expect(bmrMifflinStJeor({ sex: 'female', weightKg: 60, heightCm: 165, age: 30 })).toBe(1320.25);
  });
  it('averages the sex constant when unspecified', () => {
    const m = bmrMifflinStJeor({ sex: 'male', weightKg: 70, heightCm: 170, age: 40 });
    const f = bmrMifflinStJeor({ sex: 'female', weightKg: 70, heightCm: 170, age: 40 });
    const u = bmrMifflinStJeor({ sex: 'unspecified', weightKg: 70, heightCm: 170, age: 40 });
    expect(u).toBeCloseTo((m + f) / 2, 0);
  });
});

describe('tdee & energy delta', () => {
  it('applies the activity multiplier', () => {
    expect(tdee(1780, 'moderate')).toBeCloseTo(2759);
  });
  it('converts weekly rate into a daily delta', () => {
    expect(dailyEnergyDelta('lose', 0.5)).toBe(-550);
    expect(dailyEnergyDelta('gain', 0.25)).toBe(275);
    expect(dailyEnergyDelta('maintain', 0)).toBe(0);
  });
});

describe('macroTargets', () => {
  it('splits calories into protein, fat and carbs that add back up', () => {
    const m = macroTargets(2200, 80, 'lose');
    expect(m.proteinG).toBe(128); // 1.6 g/kg
    expect(m.fatG).toBe(73); // 30% of kcal
    const kcal =
      m.proteinG * KCAL_PER_GRAM.protein +
      m.carbsG * KCAL_PER_GRAM.carbs +
      m.fatG * KCAL_PER_GRAM.fat;
    expect(Math.abs(kcal - 2200)).toBeLessThan(15); // rounding tolerance
  });
  it('caps protein at 35% of calories and never returns negative carbs', () => {
    const m = macroTargets(1200, 150, 'lose');
    expect(m.proteinG * 4).toBeLessThanOrEqual(1200 * 0.35 + 2);
    expect(m.carbsG).toBeGreaterThanOrEqual(0);
  });
});

describe('computeDailyTargets', () => {
  const base = {
    sex: 'male' as const,
    birthYear: 1989,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'moderate' as const,
    goal: 'lose' as const,
    weeklyRateKg: 0.5,
    units: 'metric' as const,
  };

  it('computes a rounded deficit target', () => {
    const t = computeDailyTargets(base, today);
    // age 37 → BMR 1745, TDEE 2704.75, minus 550 = 2154.75 → 2150
    expect(t.bmr).toBe(1745);
    expect(t.kcal).toBe(2150);
    expect(t.floorApplied).toBe(false);
  });

  it('applies the safety floor and flags it', () => {
    const t = computeDailyTargets(
      {
        ...base,
        sex: 'female',
        weightKg: 48,
        heightCm: 152,
        activityLevel: 'sedentary',
        weeklyRateKg: 1,
      },
      today,
    );
    expect(t.kcal).toBe(1200);
    expect(t.floorApplied).toBe(true);
  });

  it('maintain returns TDEE', () => {
    const t = computeDailyTargets({ ...base, goal: 'maintain', weeklyRateKg: 0 }, today);
    expect(t.kcal).toBe(2700); // TDEE 2704.75 → nearest 10
    expect(t.floorApplied).toBe(false);
  });
});

describe('ProfileInput schema', () => {
  it('rejects a non-zero rate for maintain', () => {
    const r = ProfileInput.safeParse({
      sex: 'male',
      birthYear: 1990,
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'light',
      goal: 'maintain',
      weeklyRateKg: 0.5,
    });
    expect(r.success).toBe(false);
  });
  it('rejects users younger than 16', () => {
    const r = ProfileInput.safeParse({
      sex: 'female',
      birthYear: new Date().getUTCFullYear() - 12,
      heightCm: 150,
      weightKg: 45,
      activityLevel: 'light',
      goal: 'maintain',
      weeklyRateKg: 0,
    });
    expect(r.success).toBe(false);
  });
  it('defaults units to metric', () => {
    const r = ProfileInput.parse({
      sex: 'unspecified',
      birthYear: 1985,
      heightCm: 170,
      weightKg: 70,
      activityLevel: 'active',
      goal: 'gain',
      weeklyRateKg: 0.25,
    });
    expect(r.units).toBe('metric');
  });
});
