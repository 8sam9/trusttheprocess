import { copy } from './copy';

/** Every string value in the copy module, including the ones returned by parameterised functions. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    const sample = fn('1,200', 'metric', '0.75 kg');
    if (typeof sample === 'string') out.push(sample);
    out.push(String(fn(5, 'imperial', 'about 0.1 kg a week')));
  } else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

describe('copy rules (spec section 7)', () => {
  const banned = [
    'cheat',
    'bad food',
    'good food',
    'clean',
    'junk',
    'guilty',
    'earn',
    'deserve',
    'burn off',
    'allowed',
    'budget blown',
    'off track',
    'failed',
    'behind',
    'aggressive',
    'extreme',
    'crash',
    'underweight',
    'overweight',
    'obese',
    'bmi',
    'optimal',
    'healthy weight',
    'you must',
    'you should',
  ];

  it.each(banned)('never uses "%s"', (word) => {
    // "Deletion failed." is the existing, mandated Settings error copy (design D2, S1b "Delete errors").
    const hits = allStrings(copy)
      .filter((s) => s !== copy.deleteFailed)
      .filter((s) => new RegExp(`\\b${word}\\b`, 'i').test(s));
    expect(hits).toEqual([]);
  });

  it('uses no exclamation marks except the brand button', () => {
    const hits = allStrings(copy).filter((s) => s.includes('!') && s !== "LET'S GO");
    expect(hits).toEqual([]);
  });

  it('carries the verbatim anchor strings', () => {
    expect(copy.estimateNote).toBe(
      'This is a starting estimate. Your body is the real guide, and you can change it any time.',
    );
    expect(copy.notMedical).toBe('Not medical advice.');
    expect(copy.goalCards.just_track.description).toBe(
      'Log your food, see your patterns. No weight goal.',
    );
    expect(copy.underageBody).toBe(
      "TrustTheProcess is for people 16 and over, so we can't set this up for you yet. Thanks for stopping by, and it's fine to come back when you're 16.",
    );
    expect(copy.consentStatement).toBe(
      "By tapping I agree, you confirm you're 16 or older and agree to us storing this health data to calculate your targets.",
    );
    expect(copy.floorMaintenance('1,200')).toContain(
      "At your stats that's about your maintenance level",
    );
    expect(copy.floorLowest('1,200')).toBe(
      "1,200 kcal is the lowest target we set in the app. If you'd like to go lower, a doctor or dietitian can help you do it safely.",
    );
  });

  it('does not promise a weekly recheck against the weight trend (Gate 2 resolution 3)', () => {
    expect(allStrings(copy).some((s) => /recheck/i.test(s))).toBe(false);
  });
});
