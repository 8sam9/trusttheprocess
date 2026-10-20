import {
  GOAL_FOR_OPTION,
  PACE_PRESETS,
  defaultUnitsForRegion,
  type ActivityLevel,
  type BiologicalSex,
  type DailyTargetsRow,
  type GoalOption,
  type ProfileRow,
  type UnitSystem,
} from '@ttp/shared';
import {
  convertBodyText,
  convertPaceText,
  heightToDisplay,
  rateToDisplay,
  trimNumber,
  weightToDisplay,
} from './units';

export type PaceId = 'steady' | 'moderate' | 'faster';
export type PaceChoice = { kind: 'preset'; id: PaceId } | { kind: 'custom'; text: string };

/**
 * The user's answers while onboarding or editing targets. It lives in memory only (spec OQ 6) and keeps the raw
 * strings users type, as the old settings form did. Weight and the custom pace text are in the user's units.
 */
export interface TargetsDraft {
  units: UnitSystem;
  sex: BiologicalSex | null;
  birthYear: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weight: string;
  goalOption: GoalOption | null;
  activity: ActivityLevel | null;
  pace: PaceChoice | null;
  /** A manual calorie value; null means "use the calculated target". */
  customKcal: number | null;
  /** Show "Your inputs changed, so we recalculated your target." */
  recalculatedNotice: boolean;
  /** The user tapped I AGREE in this session (consent is recorded with the final save, ADR 0005). */
  consentGiven: boolean;
  /** The under-16 block was hit; shows the "Not yet" screen. */
  underage: boolean;
  /** Focus the year field when About you opens (after "I typed the wrong year"). */
  focusBirthYear: boolean;
  /** The profile already held values when onboarding opened (shows the "check it's still right" line). */
  prefilled: boolean;
  backCount: number;
  startedAt: number;
}

export type DraftAction =
  | { type: 'setUnits'; units: UnitSystem }
  | { type: 'setSex'; sex: BiologicalSex }
  | {
      type: 'setField';
      field: 'birthYear' | 'heightCm' | 'heightFt' | 'heightIn' | 'weight';
      value: string;
    }
  | { type: 'setGoal'; goal: GoalOption }
  | { type: 'setActivity'; activity: ActivityLevel }
  | { type: 'setPace'; pace: PaceChoice }
  | { type: 'setCustomPaceText'; text: string }
  | { type: 'setCustomKcal'; kcal: number | null }
  | { type: 'giveConsent' }
  | { type: 'markUnderage' }
  | { type: 'wrongYear' }
  | { type: 'focusHandled' }
  | { type: 'back' }
  | { type: 'replace'; draft: TargetsDraft };

export function defaultPaceFor(goal: 'lose' | 'gain'): PaceChoice {
  return { kind: 'preset', id: goal === 'lose' ? 'moderate' : 'steady' };
}

/** Kg a week of a preset for a goal and unit system (imperial presets are 0.5 / 1 / 1.5 lb in kg). */
export function presetKg(goal: 'lose' | 'gain', units: UnitSystem, id: PaceId): number | null {
  return PACE_PRESETS[goal][units].find((p) => p.id === id)?.kg ?? null;
}

export function emptyDraft(units: UnitSystem, now: number = Date.now()): TargetsDraft {
  return {
    units,
    sex: null,
    birthYear: '',
    heightCm: '',
    heightFt: '',
    heightIn: '',
    weight: '',
    goalOption: null,
    activity: null,
    pace: null,
    customKcal: null,
    recalculatedNotice: false,
    consentGiven: false,
    underage: false,
    focusBirthYear: false,
    prefilled: false,
    backCount: 0,
    startedAt: now,
  };
}

/** Marks an input change: a manual calorie value no longer applies, and the user is told. */
function withInputChange(prev: TargetsDraft, next: TargetsDraft): TargetsDraft {
  if (prev.customKcal === null) return next;
  return { ...next, customKcal: null, recalculatedNotice: true };
}

function matchPace(goal: 'lose' | 'gain', units: UnitSystem, rateKg: number | null): PaceChoice {
  if (rateKg === null || rateKg <= 0) return defaultPaceFor(goal);
  const preset = PACE_PRESETS[goal][units].find((p) => Math.abs(p.kg - rateKg) <= 0.005);
  if (preset) return { kind: 'preset', id: preset.id };
  return { kind: 'custom', text: trimNumber(rateToDisplay(rateKg, units), 2) };
}

/**
 * Builds the starting draft from the saved profile (AC 3 prefill) and, for Settings, the current targets row.
 * Units come from the device region for a first-run user, and from the profile once it holds values.
 */
export function draftFromProfile(
  row: ProfileRow,
  targets: DailyTargetsRow | null,
  region: string | null,
  now: number = Date.now(),
): TargetsDraft {
  const prefilled =
    row.sex !== null ||
    row.birth_year !== null ||
    row.height_cm !== null ||
    row.weight_kg !== null ||
    row.activity_level !== null ||
    row.goal_option !== null ||
    row.goal !== null;
  const units = prefilled || targets ? row.units : defaultUnitsForRegion(region);
  const height = row.height_cm !== null ? heightToDisplay(row.height_cm) : null;
  const goalOption: GoalOption | null =
    row.goal_option ??
    (row.goal === 'lose' ? 'lose_fat' : row.goal === 'gain' ? 'build_muscle' : null);
  const goal = goalOption ? GOAL_FOR_OPTION[goalOption] : null;
  return {
    ...emptyDraft(units, now),
    sex: row.sex,
    birthYear: row.birth_year !== null ? String(row.birth_year) : '',
    heightCm: units === 'metric' && height ? height.cm : '',
    heightFt: units === 'imperial' && height ? height.ft : '',
    heightIn: units === 'imperial' && height ? height.in : '',
    weight: row.weight_kg !== null ? weightToDisplay(row.weight_kg, units) : '',
    goalOption,
    activity: row.activity_level,
    pace: goal === 'lose' || goal === 'gain' ? matchPace(goal, units, row.weekly_rate_kg) : null,
    customKcal: targets?.is_custom ? targets.kcal : null,
    prefilled,
  };
}

export function draftReducer(state: TargetsDraft, action: DraftAction): TargetsDraft {
  switch (action.type) {
    case 'setUnits': {
      if (action.units === state.units) return state;
      const body = convertBodyText(state.units, action.units, state);
      return {
        ...state,
        ...body,
        units: action.units,
        pace:
          state.pace?.kind === 'custom'
            ? { kind: 'custom', text: convertPaceText(state.units, action.units, state.pace.text) }
            : state.pace,
      };
    }
    case 'setSex':
      return action.sex === state.sex
        ? state
        : withInputChange(state, { ...state, sex: action.sex });
    case 'setField':
      return state[action.field] === action.value
        ? state
        : withInputChange(state, { ...state, [action.field]: action.value });
    case 'setGoal': {
      if (action.goal === state.goalOption) return state;
      const goal = GOAL_FOR_OPTION[action.goal];
      const prevGoal = state.goalOption ? GOAL_FOR_OPTION[state.goalOption] : null;
      let pace: PaceChoice | null = null;
      if (goal === 'lose' || goal === 'gain') {
        // Moving between lose and gain keeps a pace that still exists; from maintain the default is preselected.
        const reusable =
          (prevGoal === 'lose' || prevGoal === 'gain') &&
          state.pace !== null &&
          (state.pace.kind === 'custom' || presetKg(goal, state.units, state.pace.id) !== null);
        pace = reusable && state.pace ? state.pace : defaultPaceFor(goal);
      }
      return withInputChange(state, { ...state, goalOption: action.goal, pace });
    }
    case 'setActivity':
      return action.activity === state.activity
        ? state
        : withInputChange(state, { ...state, activity: action.activity });
    case 'setPace':
      return JSON.stringify(action.pace) === JSON.stringify(state.pace)
        ? state
        : withInputChange(state, { ...state, pace: action.pace });
    case 'setCustomPaceText':
      return withInputChange(state, { ...state, pace: { kind: 'custom', text: action.text } });
    case 'setCustomKcal':
      return { ...state, customKcal: action.kcal, recalculatedNotice: false };
    case 'giveConsent':
      return { ...state, consentGiven: true };
    case 'markUnderage':
      // Nothing about the answers is kept: the year and the in-memory consent are cleared.
      return { ...state, underage: true, birthYear: '', consentGiven: false };
    case 'wrongYear':
      return {
        ...state,
        underage: false,
        birthYear: '',
        consentGiven: false,
        focusBirthYear: true,
      };
    case 'focusHandled':
      return state.focusBirthYear ? { ...state, focusBirthYear: false } : state;
    case 'back':
      return { ...state, backCount: state.backCount + 1 };
    case 'replace':
      return action.draft;
  }
}

/** Fields that decide whether a sheet's working copy differs from where it started. */
export function draftSignature(d: TargetsDraft): string {
  return JSON.stringify([
    d.units,
    d.sex,
    d.birthYear,
    d.heightCm,
    d.heightFt,
    d.heightIn,
    d.weight,
    d.goalOption,
    d.activity,
    d.pace,
    d.customKcal,
  ]);
}
