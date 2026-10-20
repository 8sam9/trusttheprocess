import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileInput } from './profile';

const base = {
  sex: 'female',
  birthYear: 1996,
  heightCm: 165,
  weightKg: 65,
  activityLevel: 'light',
  goal: 'lose',
  weeklyRateKg: 0.5,
};

afterEach(() => vi.useRealTimers());

describe('ProfileInput weekly rate (CR-1, AC 33)', () => {
  const lose = (weeklyRateKg: number) => ProfileInput.safeParse({ ...base, weeklyRateKg }).success;
  it('accepts 0.01 to 1.5 for lose and gain and rejects outside', () => {
    expect(lose(0.009)).toBe(false);
    expect(lose(0.01)).toBe(true);
    expect(lose(0.75)).toBe(true);
    expect(lose(0.76)).toBe(true); // above the recommendation but allowed
    expect(lose(1.5)).toBe(true);
    expect(lose(1.51)).toBe(false);
    expect(ProfileInput.safeParse({ ...base, goal: 'gain', weeklyRateKg: 1.5 }).success).toBe(true);
    expect(ProfileInput.safeParse({ ...base, goal: 'gain', weeklyRateKg: 1.51 }).success).toBe(
      false,
    );
    expect(lose(0)).toBe(false);
  });
  it('requires exactly 0 for maintain', () => {
    expect(ProfileInput.safeParse({ ...base, goal: 'maintain', weeklyRateKg: 0 }).success).toBe(
      true,
    );
    expect(ProfileInput.safeParse({ ...base, goal: 'maintain', weeklyRateKg: 0.25 }).success).toBe(
      false,
    );
  });
});

describe('ProfileInput ranges and birth-year bounds', () => {
  it('bounds height and weight', () => {
    const p = (o: object) => ProfileInput.safeParse({ ...base, ...o }).success;
    expect(p({ heightCm: 99.9 })).toBe(false);
    expect(p({ heightCm: 100 })).toBe(true);
    expect(p({ heightCm: 250 })).toBe(true);
    expect(p({ heightCm: 250.1 })).toBe(false);
    expect(p({ weightKg: 29.9 })).toBe(false);
    expect(p({ weightKg: 30 })).toBe(true);
    expect(p({ weightKg: 350 })).toBe(true);
    expect(p({ weightKg: 350.1 })).toBe(false);
  });

  it('allows ages 16 to 110 by calendar-year difference (AC 12)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const by = (birthYear: number) => ProfileInput.safeParse({ ...base, birthYear }).success;
    expect(by(2011)).toBe(false); // 15
    expect(by(2010)).toBe(true); // 16
    expect(by(1916)).toBe(true); // 110
    expect(by(1915)).toBe(false); // 111
  });

  it('evaluates the bounds at parse time, not module load', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T23:00:00Z'));
    expect(ProfileInput.safeParse({ ...base, birthYear: 2010 }).success).toBe(true);
    expect(ProfileInput.safeParse({ ...base, birthYear: 2011 }).success).toBe(false);
    vi.setSystemTime(new Date('2027-01-01T00:30:00Z'));
    expect(ProfileInput.safeParse({ ...base, birthYear: 2011 }).success).toBe(true);
    expect(ProfileInput.safeParse({ ...base, birthYear: 2012 }).success).toBe(false);
  });
});
