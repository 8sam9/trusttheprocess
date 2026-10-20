import { describe, expect, it } from 'vitest';
import {
  ApplyTargetsArgs,
  ApplyTargetsErrorCode,
  ApplyTargetsResult,
  CachedGate,
  buildApplyTargetsArgs,
} from './api';
import cases from './__fixtures__/apply-targets-cases.json';
import { applyManualKcal, explainTargets } from './targets';
import type { ProfileInput } from './profile';

interface Case {
  name: string;
  age: number;
  args: Record<string, unknown>;
  consentOnServer: boolean;
  expect: string;
  clientRejects: boolean;
}

const withBirthYear = (c: Case) => ({
  ...c.args,
  p_birth_year: new Date().getUTCFullYear() - c.age,
});

describe('apply-targets fixture (shared with the generated pgTAP file)', () => {
  const list = cases as Case[];

  it('has unique names and valid expectations', () => {
    expect(new Set(list.map((c) => c.name)).size).toBe(list.length);
    for (const c of list) {
      expect(c.expect === 'ok' || ApplyTargetsErrorCode.safeParse(c.expect).success).toBe(true);
    }
  });

  it('covers the boundaries named in the plan', () => {
    const names = list.map((c) => c.name).join('|');
    for (const needle of [
      'AC17',
      'AC20',
      'age 15',
      'age 16',
      'age 17',
      'age 18',
      'age 110',
      'age 111',
      'BMI 18.4',
      'BMI 18.5',
      'rate 0.009',
      'rate 0.01',
      'rate 0.75',
      'rate 0.76',
      'rate 1.5',
      'rate 1.51',
      '1199',
      '1499',
      '6000',
      '6001',
      '9000',
      'exactly 10',
      'off by 11',
      'consent missing',
      'floor at or above maintenance',
    ]) {
      expect(names, needle).toContain(needle);
    }
  });

  for (const c of cases as Case[]) {
    it(`${c.name} -> ${c.expect}`, () => {
      const result = ApplyTargetsArgs.safeParse(withBirthYear(c));
      if (c.clientRejects) {
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0]?.message).toBe(c.expect);
      } else {
        expect(result.success).toBe(true);
      }
    });
  }
});

describe('ApplyTargetsArgs', () => {
  const first = (cases as Case[]).find((c) => c.expect === 'ok');
  if (!first) throw new Error('fixture has no ok case');
  const ok = withBirthYear(first);

  it('rejects unknown keys', () => {
    expect(ApplyTargetsArgs.safeParse({ ...ok, p_extra: 1 }).success).toBe(false);
  });
  it('rejects non-integer kcal and macros', () => {
    expect(ApplyTargetsArgs.safeParse({ ...ok, p_kcal: 1330.5 }).success).toBe(false);
    expect(ApplyTargetsArgs.safeParse({ ...ok, p_protein_g: 104.2 }).success).toBe(false);
  });
  it('rejects negative macros', () => {
    const r = ApplyTargetsArgs.safeParse({ ...ok, p_carbs_g: -1 });
    expect(r.success).toBe(false);
  });
});

describe('buildApplyTargetsArgs', () => {
  const input: ProfileInput = {
    sex: 'female',
    birthYear: new Date().getUTCFullYear() - 30,
    heightCm: 165.04,
    weightKg: 65.123,
    activityLevel: 'light',
    goal: 'lose',
    weeklyRateKg: 0.5,
    units: 'imperial',
  };
  const breakdown = explainTargets(input);
  const final = applyManualKcal(breakdown, breakdown.calculatedKcal, input);

  it('builds args that pass the schema and round to column precision', () => {
    const args = buildApplyTargetsArgs({
      input,
      goalOption: 'lose_fat',
      timezone: 'Europe/Rome',
      giveConsent: true,
      breakdown,
      final,
    });
    expect(ApplyTargetsArgs.safeParse(args).success).toBe(true);
    expect(args).toMatchObject({
      p_give_consent: true,
      p_goal_option: 'lose_fat',
      p_height_cm: 165,
      p_weight_kg: 65.12,
      p_units: 'imperial',
      p_calculated_kcal: breakdown.calculatedKcal,
      p_kcal: final.kcal,
      p_formula_version: 'msj-1',
    });
  });
  it('throws when the goal option contradicts the goal', () => {
    expect(() =>
      buildApplyTargetsArgs({
        input,
        goalOption: 'build_muscle',
        timezone: 'UTC',
        giveConsent: false,
        breakdown,
        final,
      }),
    ).toThrow();
  });
});

describe('ApplyTargetsResult and CachedGate', () => {
  const profile = {
    user_id: 'u1',
    display_name: null,
    sex: 'female',
    birth_year: 1996,
    height_cm: 165,
    activity_level: 'light',
    goal: 'lose',
    goal_option: 'lose_fat',
    weekly_rate_kg: 0.5,
    weight_kg: 65,
    weight_recorded_on: '2026-10-20',
    units: 'metric',
    timezone: 'Europe/Rome',
    health_data_consent_at: '2026-10-20T08:00:00+00:00',
    onboarding_completed_at: '2026-10-20T08:00:00+00:00',
    created_at: '2026-10-19T08:00:00+00:00',
    updated_at: '2026-10-20T08:00:00+00:00',
  };
  const targets = {
    user_id: 'u1',
    effective_from: '2026-10-20',
    kcal: 1330,
    protein_g: 104,
    carbs_g: 129,
    fat_g: 44,
    calculated_kcal: 1330,
    is_custom: false,
    floor_applied: false,
    bmr: 1370,
    maintenance_kcal: 1884,
    goal: 'lose',
    goal_option: 'lose_fat',
    weekly_rate_kg: 0.5,
    activity_level: 'light',
    formula_version: 'msj-1',
    created_at: '2026-10-20T08:00:00+00:00',
    updated_at: '2026-10-20T08:00:00+00:00',
  };
  it('parses a server response', () => {
    expect(ApplyTargetsResult.safeParse({ profile, targets }).success).toBe(true);
    expect(
      ApplyTargetsResult.safeParse({ profile, targets: { ...targets, kcal: 'x' } }).success,
    ).toBe(false);
  });
  it('validates the gate cache and rejects corrupt values', () => {
    const gate = {
      v: 1,
      onboardingCompleted: true,
      targets: {
        effective_from: '2026-10-20',
        kcal: 1330,
        protein_g: 104,
        carbs_g: 129,
        fat_g: 44,
        is_custom: false,
        floor_applied: false,
      },
      cachedAt: new Date().toISOString(),
    };
    expect(CachedGate.safeParse(gate).success).toBe(true);
    expect(CachedGate.safeParse({ ...gate, targets: null }).success).toBe(true);
    expect(CachedGate.safeParse({ ...gate, v: 2 }).success).toBe(false);
    expect(CachedGate.safeParse({ ...gate, cachedAt: 'yesterday' }).success).toBe(false);
    expect(CachedGate.safeParse('garbage').success).toBe(false);
  });
});
