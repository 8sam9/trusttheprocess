import { makeProfile, makeTargets } from '@/test/backend';
import { draftFromProfile, draftReducer, emptyDraft, type TargetsDraft } from './draft';

const base = (over: Partial<TargetsDraft> = {}): TargetsDraft => ({
  ...emptyDraft('metric', 0),
  ...over,
});

describe('draftFromProfile (AC 3, 15)', () => {
  it('prefills what the profile already holds and flags it', () => {
    const d = draftFromProfile(
      makeProfile({ sex: 'female', birth_year: 1996, height_cm: 165, activity_level: 'light' }),
      null,
      'US',
    );
    expect(d).toMatchObject({
      sex: 'female',
      birthYear: '1996',
      heightCm: '165',
      activity: 'light',
      prefilled: true,
      units: 'metric', // the profile's own units win once it holds values
    });
  });

  it('leaves a first-run draft empty and takes units from the device region', () => {
    const us = draftFromProfile(makeProfile(), null, 'US');
    expect(us).toMatchObject({ prefilled: false, units: 'imperial', sex: null, goalOption: null });
    expect(draftFromProfile(makeProfile(), null, 'IT').units).toBe('metric');
    expect(draftFromProfile(makeProfile(), null, null).units).toBe('metric');
  });

  it('shows stored values in the stored units', () => {
    const d = draftFromProfile(
      makeProfile({ units: 'imperial', height_cm: 165.1, weight_kg: 65.77, sex: 'male' }),
      null,
      'IT',
    );
    expect(d).toMatchObject({ heightFt: '5', heightIn: '5', weight: '145' });
  });

  it('maps a legacy goal to the card, but leaves maintain unselected (ambiguous)', () => {
    expect(draftFromProfile(makeProfile({ goal: 'lose' }), null, null).goalOption).toBe('lose_fat');
    expect(draftFromProfile(makeProfile({ goal: 'gain' }), null, null).goalOption).toBe(
      'build_muscle',
    );
    expect(draftFromProfile(makeProfile({ goal: 'maintain' }), null, null).goalOption).toBeNull();
    expect(
      draftFromProfile(makeProfile({ goal: 'maintain', goal_option: 'just_track' }), null, null)
        .goalOption,
    ).toBe('just_track');
  });

  it('selects the preset a stored rate matches, otherwise Custom', () => {
    const lose = (rate: number | null, units: 'metric' | 'imperial' = 'metric') =>
      draftFromProfile(
        makeProfile({
          goal: 'lose',
          goal_option: 'lose_fat',
          weekly_rate_kg: rate,
          units,
          sex: 'male',
        }),
        null,
        null,
      ).pace;
    expect(lose(0.75)).toEqual({ kind: 'preset', id: 'faster' });
    expect(lose(0.2549)).toEqual({ kind: 'preset', id: 'steady' });
    expect(lose(0.45, 'imperial')).toEqual({ kind: 'preset', id: 'moderate' });
    // Stored kg rates match presets by kg value whatever the display units (spec 001 QA bug 7).
    expect(lose(0.5, 'imperial')).toEqual({ kind: 'preset', id: 'moderate', kg: 0.5 });
    expect(lose(0.45)).toEqual({ kind: 'preset', id: 'moderate', kg: 0.45 });
    expect(lose(0.23)).toEqual({ kind: 'preset', id: 'steady', kg: 0.23 });
    expect(lose(0.68, 'metric')).toEqual({ kind: 'preset', id: 'faster', kg: 0.68 });
    expect(lose(0.6, 'imperial')).toEqual({ kind: 'custom', text: '1.32' });
    expect(lose(1.2)).toEqual({ kind: 'custom', text: '1.2' });
    expect(lose(null)).toEqual({ kind: 'preset', id: 'moderate' });
  });

  it('seeds a manual calorie value from a custom stored target', () => {
    const row = makeTargets({ is_custom: true, kcal: 1500, calculated_kcal: 1330 });
    expect(draftFromProfile(makeProfile({ units: 'metric' }), row, null).customKcal).toBe(1500);
    expect(draftFromProfile(makeProfile(), makeTargets(), null).customKcal).toBeNull();
  });
});

describe('goal and pace rules (AC 5, 7)', () => {
  it('maintain clears the pace; lose or gain from maintain preselects the default', () => {
    let d = draftReducer(base(), { type: 'setGoal', goal: 'lose_fat' });
    expect(d.pace).toEqual({ kind: 'preset', id: 'moderate' });
    d = draftReducer(d, { type: 'setGoal', goal: 'just_track' });
    expect(d.pace).toBeNull();
    d = draftReducer(d, { type: 'setGoal', goal: 'build_muscle' });
    expect(d.pace).toEqual({ kind: 'preset', id: 'steady' });
    d = draftReducer(d, { type: 'setGoal', goal: 'fuel_performance' });
    expect(d.pace).toBeNull();
  });

  it('keeps a pace that still exists when moving between lose and gain', () => {
    let d = draftReducer(base(), { type: 'setGoal', goal: 'lose_fat' });
    d = draftReducer(d, { type: 'setPace', pace: { kind: 'preset', id: 'moderate' } });
    expect(draftReducer(d, { type: 'setGoal', goal: 'build_muscle' }).pace).toEqual({
      kind: 'preset',
      id: 'moderate',
    });
    d = draftReducer(d, { type: 'setPace', pace: { kind: 'preset', id: 'faster' } });
    // gain has no Faster option
    expect(draftReducer(d, { type: 'setGoal', goal: 'build_muscle' }).pace).toEqual({
      kind: 'preset',
      id: 'steady',
    });
    d = draftReducer(d, { type: 'setCustomPaceText', text: '1.2' });
    expect(draftReducer(d, { type: 'setGoal', goal: 'build_muscle' }).pace).toEqual({
      kind: 'custom',
      text: '1.2',
    });
  });
});

describe('unit switching converts what is typed (AC 14, 15)', () => {
  const typed = base({
    heightCm: '165',
    weight: '65',
    pace: { kind: 'custom', text: '0.5' },
  });

  it('metric to imperial', () => {
    const d = draftReducer(typed, { type: 'setUnits', units: 'imperial' });
    expect(d).toMatchObject({
      units: 'imperial',
      heightFt: '5',
      heightIn: '5',
      heightCm: '',
      weight: '143.3',
    });
    expect(d.pace).toEqual({ kind: 'custom', text: '1.1' });
  });

  it('imperial to metric', () => {
    const imperial = base({ units: 'imperial', heightFt: '5', heightIn: '7', weight: '155' });
    const d = draftReducer(imperial, { type: 'setUnits', units: 'metric' });
    expect(d).toMatchObject({
      units: 'metric',
      heightCm: '170',
      heightFt: '',
      heightIn: '',
      weight: '70.3',
    });
  });

  it('leaves unparseable text alone and never clears fields', () => {
    const d = draftReducer(base({ weight: 'abc', heightCm: '' }), {
      type: 'setUnits',
      units: 'imperial',
    });
    expect(d.weight).toBe('abc');
  });
});

describe('manual calories and inputs (Gate 2 resolution 5)', () => {
  const custom = base({ sex: 'female', customKcal: 1500 });

  it('clears the custom value and raises the notice when an input changes', () => {
    const d = draftReducer(custom, { type: 'setSex', sex: 'male' });
    expect(d).toMatchObject({ customKcal: null, recalculatedNotice: true });
  });

  it('does not clear it for no-op changes or unit switches', () => {
    expect(draftReducer(custom, { type: 'setSex', sex: 'female' })).toBe(custom);
    expect(draftReducer(custom, { type: 'setUnits', units: 'imperial' }).customKcal).toBe(1500);
  });

  it('a new manual value dismisses the notice', () => {
    const d = draftReducer(
      { ...custom, customKcal: null, recalculatedNotice: true },
      { type: 'setCustomKcal', kcal: 1400 },
    );
    expect(d).toMatchObject({ customKcal: 1400, recalculatedNotice: false });
  });
});

describe('under-16 and consent state', () => {
  it('markUnderage clears the year and the in-memory consent; wrongYear reopens consent', () => {
    let d = draftReducer(base({ birthYear: '2015', consentGiven: true }), { type: 'markUnderage' });
    expect(d).toMatchObject({ underage: true, birthYear: '', consentGiven: false });
    d = draftReducer(d, { type: 'wrongYear' });
    expect(d).toMatchObject({ underage: false, consentGiven: false, focusBirthYear: true });
    expect(draftReducer(d, { type: 'focusHandled' }).focusBirthYear).toBe(false);
  });

  it('counts back navigations', () => {
    expect(draftReducer(draftReducer(base(), { type: 'back' }), { type: 'back' }).backCount).toBe(
      2,
    );
  });
});
