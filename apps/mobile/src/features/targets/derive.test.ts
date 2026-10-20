import { copy } from './copy';
import {
  aboutSummary,
  buildPlan,
  changedKinds,
  customPaceInfo,
  effectiveGoalOption,
  isGuarded,
  paceBandFor,
  paceOptions,
  paceSummary,
  recommendedLimitText,
} from './derive';
import { emptyDraft, type TargetsDraft } from './draft';

const NOW = new Date('2026-10-20T10:00:00Z');

/** AC 17: female, 30, 165 cm, 65 kg, lightly active, lose 0.5 kg a week. */
const worked: TargetsDraft = {
  ...emptyDraft('metric', 0),
  sex: 'female',
  birthYear: '1996',
  heightCm: '165',
  weight: '65',
  goalOption: 'lose_fat',
  activity: 'light',
  pace: { kind: 'preset', id: 'moderate' },
};
/** AC 20: female, 40, 155 cm, 50 kg, sedentary, lose 0.75 kg a week. */
const floor: TargetsDraft = {
  ...worked,
  birthYear: '1986',
  heightCm: '155',
  weight: '50',
  activity: 'sedentary',
  pace: { kind: 'preset', id: 'faster' },
};

const plan = (d: TargetsDraft) => {
  const p = buildPlan(d, NOW);
  if (!p) throw new Error('expected a plan');
  return p;
};
const rows = (d: TargetsDraft) =>
  plan(d).rows.map((r) => [r.label, r.value, r.sub ?? null] as const);

describe('worked example (AC 17, 19)', () => {
  it('computes the targets and the maths panel in order', () => {
    const p = plan(worked);
    expect(p.final).toMatchObject({ kcal: 1330, proteinG: 104, carbsG: 129, fatG: 44 });
    expect(p.breakdown).toMatchObject({ maintenanceKcal: 1884, bmr: 1370 });
    expect(rows(worked)).toEqual([
      [copy.rowMaintenance, 1884, 'BMR 1,370 × 1.375, lightly active'],
      [copy.rowDeficit, -550, null],
      [copy.rowTotal, 1330, copy.rowRounded],
    ]);
    expect(p.eyebrow).toBe('LOSE FAT · MODERATE · 0.5 KG A WEEK');
    expect(p.floorNotice).toBeNull();
  });

  it('maintenance plus the adjustment equals the target within rounding (AC 19)', () => {
    const [m, a, t] = plan(worked).rows;
    expect(Math.abs(m!.value + a!.value - t!.value)).toBeLessThanOrEqual(5);
  });

  it('gain shows the lean-gain surplus; maintain shows no adjustment and no pace', () => {
    const gain = {
      ...worked,
      goalOption: 'build_muscle' as const,
      pace: { kind: 'preset' as const, id: 'steady' as const },
    };
    expect(rows(gain)[1]).toEqual([copy.rowSurplus, 275, null]);
    expect(plan(gain).eyebrow).toBe('BUILD MUSCLE · STEADY · 0.25 KG A WEEK');
    const keep = { ...worked, goalOption: 'just_track' as const, pace: null };
    expect(rows(keep)[1]).toEqual([copy.rowAdjustment, 0, null]);
    expect(plan(keep)).toMatchObject({
      eyebrow: 'JUST TRACK · STEADY WEIGHT',
      paceOption: null,
      rateKg: 0,
    });
  });

  it('shows imperial paces in lb', () => {
    const imp = {
      ...worked,
      units: 'imperial' as const,
      heightCm: '',
      heightFt: '5',
      heightIn: '5',
      weight: '143',
    };
    expect(plan(imp).eyebrow).toBe('LOSE FAT · MODERATE · 1 LB A WEEK');
  });
});

describe('safety floor (AC 20)', () => {
  it('raises to the floor and shows the implied pace', () => {
    const p = plan(floor);
    expect(p.final).toMatchObject({ kcal: 1200, proteinG: 80, carbsG: 130, fatG: 40 });
    expect(p.breakdown.floorApplied).toBe(true);
    expect(p.eyebrow).toBe('LOSE FAT · ABOUT 0.1 KG A WEEK AT THIS TARGET');
    expect(p.floorNotice).toBe(
      "We set your target to 1,200 kcal, a minimum we use for safety. At your stats that means a slower pace than you chose, about 0.1 kg a week. If you'd like a faster pace, a doctor or dietitian can help you plan it safely.",
    );
    expect(rows(floor)).toEqual([
      [copy.rowMaintenance, 1329, 'BMR 1,108 × 1.2, mostly sitting'],
      [copy.rowFloorDeficit, -129, null],
      [copy.rowTotal, 1200, null],
    ]);
  });

  it('uses the second message when the floor is at or above maintenance', () => {
    const tiny = {
      ...worked,
      birthYear: '1940',
      heightCm: '100',
      weight: '30',
      activity: 'sedentary' as const,
      pace: { kind: 'preset' as const, id: 'steady' as const },
    };
    const p = plan(tiny);
    expect(p.floorNotice).toBe(copy.floorMaintenance('1,200'));
    expect(p.eyebrow).toBe('LOSE FAT · STEADY WEIGHT AT THIS TARGET');
    expect(p.rows[1]?.label).toBe(copy.rowFloorDifference);
    expect(p.rows[1]?.value).toBeGreaterThan(0);
  });

  it('a very slow implied pace reads "less than 0.1"', () => {
    const nearFloor = {
      ...worked,
      birthYear: '1992',
      heightCm: '150',
      weight: '42',
      activity: 'sedentary' as const,
      pace: { kind: 'preset' as const, id: 'steady' as const },
    };
    const p = plan(nearFloor);
    expect(p.breakdown.floorApplied).toBe(true);
    expect(p.eyebrow).toBe('LOSE FAT · LESS THAN 0.1 KG A WEEK AT THIS TARGET');
    expect(p.floorNotice).toContain('a slower pace than you chose, less than 0.1 kg a week.');
  });
});

describe('manual calories (AC 22)', () => {
  it('marks the plan custom and adds a "Your adjustment" row that keeps the sum', () => {
    const p = plan({ ...worked, customKcal: 1400 });
    expect(p.isCustom).toBe(true);
    expect(p.final).toMatchObject({ kcal: 1400, proteinG: 104 });
    expect(p.rows.map((r) => r.label)).toEqual([
      copy.rowMaintenance,
      copy.rowDeficit,
      copy.rowCustom,
      copy.rowTotal,
    ]);
    expect(p.rows[2]).toMatchObject({ value: 70, sub: 'Calculated target was 1,330' });
  });

  it('snaps below-floor and above-cap values and never goes custom at the calculated value', () => {
    expect(plan({ ...worked, customKcal: 900 }).final.kcal).toBe(1200);
    expect(plan({ ...worked, customKcal: 13300 }).final.kcal).toBe(6000);
    expect(plan({ ...worked, customKcal: 1330 }).isCustom).toBe(false);
  });
});

describe('guard (AC 16)', () => {
  it('is active for 16 to 17 and for BMI under 18.5, but never exposes a BMI', () => {
    expect(isGuarded({ ...worked, birthYear: '2009' }, NOW)).toBe(true);
    expect(isGuarded({ ...worked, birthYear: '2008' }, NOW)).toBe(false);
    expect(isGuarded({ ...worked, heightCm: '180', weight: '59.9' }, NOW)).toBe(true);
    expect(isGuarded({ ...worked, heightCm: '180', weight: '60' }, NOW)).toBe(false);
    expect(isGuarded(emptyDraft('metric', 0), NOW)).toBe(false);
  });

  it('drops a stored Lose fat when the guard is active, so no plan can be built', () => {
    const guarded = { ...worked, birthYear: '2009' };
    expect(effectiveGoalOption(guarded, NOW)).toBeNull();
    expect(buildPlan(guarded, NOW)).toBeNull();
    expect(effectiveGoalOption({ ...guarded, goalOption: 'build_muscle' }, NOW)).toBe(
      'build_muscle',
    );
  });
});

describe('pace options (S5, CR-1)', () => {
  it('shows live kcal lines per option, in the user units', () => {
    const lines = paceOptions(worked, 'lose', NOW).map((o) => [o.title, o.rate, o.kcalLine]);
    expect(lines).toEqual([
      ['STEADY', '0.25 kg a week', 'About 275 kcal a day below maintenance'],
      ['MODERATE', '0.5 kg a week', 'About 550 kcal a day below maintenance'],
      ['FASTER', '0.75 kg a week', 'About 825 kcal a day below maintenance'],
    ]);
    const imp = {
      ...worked,
      units: 'imperial' as const,
      heightCm: '',
      heightFt: '5',
      heightIn: '5',
      weight: '143',
    };
    expect(paceOptions(imp, 'lose', NOW).map((o) => [o.rate, o.kcalLine])).toEqual([
      ['0.5 lb a week', 'About 250 kcal a day below maintenance'],
      ['1 lb a week', 'About 500 kcal a day below maintenance'],
      ['1.5 lb a week', 'About 750 kcal a day below maintenance'],
    ]);
    const gain = paceOptions({ ...worked, goalOption: 'build_muscle' }, 'gain', NOW);
    expect(gain.map((o) => o.title)).toEqual(['STEADY', 'MODERATE']);
    expect(gain[0]?.kcalLine).toBe('About 275 kcal a day above maintenance');
  });

  it('adds the floor hint only to options that stop at the minimum', () => {
    // Worked example: maintenance 1,884, so only Faster (825 below) falls under 1,200.
    expect(paceOptions(worked, 'lose', NOW).map((o) => o.hint)).toEqual([
      undefined,
      undefined,
      'At your stats, this stops at our 1,200 kcal minimum.',
    ]);
    expect(
      paceOptions(floor, 'lose', NOW).every((o) => o.hint === copy.paceFloorHint('1,200')),
    ).toBe(true);
  });

  it('describes a custom pace and its hint', () => {
    expect(customPaceInfo(worked, 'lose', 0.6, NOW)).toEqual({
      kcalLine: 'About 660 kcal a day below maintenance',
    });
    expect(customPaceInfo(worked, 'lose', 1.2, NOW)).toEqual({
      kcalLine: 'About 1,320 kcal a day below maintenance',
      hint: copy.paceFloorHint('1,200'),
    });
  });

  it('shows the eyebrow with a custom pace and bands the rate (AC 34)', () => {
    const big = {
      ...worked,
      sex: 'male' as const,
      heightCm: '180',
      weight: '90',
      activity: 'moderate' as const,
    };
    const p = plan({ ...big, pace: { kind: 'custom', text: '1' } });
    expect(p.eyebrow).toBe('LOSE FAT · CUSTOM · 1.0 KG A WEEK');
    expect(p).toMatchObject({ paceOption: 'custom', paceBand: 'gt_0_75' });
    expect(plan(big).paceBand).toBe('le_0_75');
    expect(paceBandFor(0.75)).toBe('le_0_75');
    expect(paceBandFor(0.76)).toBe('gt_0_75');
  });

  it('states the 0.75 recommendation in the user units', () => {
    expect(recommendedLimitText('metric')).toBe('0.75 kg');
    expect(recommendedLimitText('imperial')).toBe('1.65 lb');
    expect(copy.paceStrongSuggestion('0.75 kg')).toBe(
      'We strongly suggest no more than 0.75 kg a week. Slower is easier to keep up and protects muscle.',
    );
    expect(copy.paceFaster('0.75 kg')).toBe(
      'Faster than we recommend. We strongly suggest 0.75 kg a week or less. You can still go ahead.',
    );
  });
});

describe('summaries and change detection', () => {
  it('builds the list-row values', () => {
    expect(paceSummary(worked)).toBe('Moderate · 0.5 kg a week');
    expect(paceSummary({ ...worked, pace: { kind: 'custom', text: '1' } })).toBe(
      'Custom · 1.0 kg a week',
    );
    expect(aboutSummary(worked)).toBe('Female · 1996 · 165 cm · 65 kg');
    expect(
      aboutSummary({ ...worked, units: 'imperial', heightFt: '5', heightIn: '5', weight: '143' }),
    ).toBe('Female · 1996 · 5 ft 5 in · 143 lb');
  });

  it('lists what changed for the targets_updated event', () => {
    expect(changedKinds(worked, worked, null)).toEqual([]);
    expect(
      changedKinds(
        worked,
        { ...worked, activity: 'moderate', weight: '66', customKcal: 1400 },
        null,
      ),
    ).toEqual(['activity', 'stats', 'manual_calories']);
    expect(
      changedKinds(
        worked,
        { ...worked, goalOption: 'just_track', pace: null, units: 'imperial' },
        null,
      ),
    ).toEqual(['goal', 'pace', 'units']);
  });
});
