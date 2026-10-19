import type { ActivityLevel, BiologicalSex, Goal, ProfileInput } from './profile';
import { round } from './units';

export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Approximate energy content of 1 kg of body-weight change. */
export const KCAL_PER_KG = 7700;

/**
 * Safety floors: never auto-suggest a target below these without a warning shown to the user.
 * Generic population guidance, not medical advice.
 */
export const CALORIE_FLOOR: Record<BiologicalSex, number> = {
  female: 1200,
  male: 1500,
  unspecified: 1200,
};

export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

const SEX_CONSTANT: Record<BiologicalSex, number> = { male: 5, female: -161, unspecified: -78 };

export function ageInYears(birthYear: number, today: Date = new Date()): number {
  return today.getUTCFullYear() - birthYear;
}

/** Mifflin-St Jeor basal metabolic rate, kcal/day. */
export function bmrMifflinStJeor(p: {
  sex: BiologicalSex;
  weightKg: number;
  heightCm: number;
  age: number;
}): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + SEX_CONSTANT[p.sex];
}

export function tdee(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIER[activity];
}

export function dailyEnergyDelta(goal: Goal, weeklyRateKg: number): number {
  if (goal === 'maintain') return 0;
  const delta = (weeklyRateKg * KCAL_PER_KG) / 7;
  return goal === 'lose' ? -delta : delta;
}

export interface MacroTargets {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DailyTargets extends MacroTargets {
  kcal: number;
  bmr: number;
  tdee: number;
  /** True when the computed target was raised to the safety floor. The UI must explain this. */
  floorApplied: boolean;
}

/** Protein g per kg body weight by goal. */
export const PROTEIN_G_PER_KG: Record<Goal, number> = { lose: 1.6, maintain: 1.4, gain: 1.6 };
/** Share of calories from fat. */
export const FAT_KCAL_SHARE = 0.3;

export function macroTargets(kcal: number, weightKg: number, goal: Goal): MacroTargets {
  // Cap protein at 35% of calories so very low targets still leave room for carbs and fat.
  const proteinG = Math.min(
    PROTEIN_G_PER_KG[goal] * weightKg,
    (kcal * 0.35) / KCAL_PER_GRAM.protein,
  );
  const fatG = (kcal * FAT_KCAL_SHARE) / KCAL_PER_GRAM.fat;
  const carbKcal = kcal - proteinG * KCAL_PER_GRAM.protein - fatG * KCAL_PER_GRAM.fat;
  const carbsG = Math.max(0, carbKcal / KCAL_PER_GRAM.carbs);
  return { proteinG: round(proteinG), carbsG: round(carbsG), fatG: round(fatG) };
}

export function computeDailyTargets(profile: ProfileInput, today: Date = new Date()): DailyTargets {
  const bmr = bmrMifflinStJeor({
    sex: profile.sex,
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: ageInYears(profile.birthYear, today),
  });
  const maintenance = tdee(bmr, profile.activityLevel);
  const raw = maintenance + dailyEnergyDelta(profile.goal, profile.weeklyRateKg);
  const floor = CALORIE_FLOOR[profile.sex];
  const floorApplied = raw < floor;
  const kcal = round(Math.max(raw, floor) / 10) * 10;
  return {
    kcal,
    bmr: round(bmr),
    tdee: round(maintenance),
    floorApplied,
    ...macroTargets(kcal, profile.weightKg, profile.goal),
  };
}
