import type { ActivityLevel, GoalOption, UnitSystem } from '@ttp/shared';

/**
 * Every user-facing string of spec 001 (design section D4), verbatim and keyed by its copy id, so copy review
 * and tests share one source. Parameterised strings are functions. The CR-1 (custom pace) strings are at the end.
 * Numbers arrive pre-formatted (thousands separators) from the caller.
 */
export const copy = {
  // C-g: all steps
  stepLabel: (n: number) => `STEP ${n} OF 5`, // C-g1
  stepSpoken: (n: number) => `Step ${n} of 5`, // C-g1 (screen reader)
  continue: 'CONTINUE', // C-g2
  tagline: 'Trust the process. Show up, log, repeat.', // C-g3

  // C-s0: signed-in entry
  loadingPlan: 'Loading your plan', // C-s0a
  loadError: "We couldn't load your profile. Check your connection and try again.", // C-s0b
  tryAgain: 'TRY AGAIN', // C-s0b, C-sv4
  signOut: 'Sign out', // C-s0b, C-c10, C-d4, C-u4

  // C-c: consent
  consentEyebrow: 'BEFORE WE START', // C-c1
  consentTitle: 'YOUR DATA, YOUR CALL', // C-c2
  consentIntro:
    "To set your targets we need some health-related details. Here's the deal, in plain words.", // C-c3
  consentFacts: [
    {
      title: 'What we store',
      detail:
        'Your goal, sex, year of birth, height, weight, activity level and, later, your food diary.',
    }, // C-c4
    {
      title: 'Why',
      detail: 'To estimate your energy needs and show your daily targets. Nothing else.',
    }, // C-c5
    { title: 'Who sees it', detail: 'Never sold. Never shown to advertisers.' }, // C-c6
    {
      title: 'Your control',
      detail: 'Withdraw consent or delete everything any time in Settings.',
    }, // C-c7
  ],
  privacyLink: 'Read the privacy policy', // C-c8
  consentStatement:
    "By tapping I agree, you confirm you're 16 or older and agree to us storing this health data to calculate your targets.", // C-c9
  agree: 'I AGREE', // C-c10
  noThanks: 'NO THANKS', // C-c10
  consentOffline: "You're offline, so we couldn't record your consent yet. Nothing has been saved.", // C-c11
  consentServer: "We couldn't record your consent just now. Nothing has been saved.", // C-c12
  consentWithdrawn:
    'You turned off health-data consent. To save body stats or targets again, we need it back.', // C-c13

  // C-d: consent declined
  declinedTitle: 'YOUR CALL, RESPECTED', // C-d1
  declinedBody:
    "Without your body stats we can't estimate calories and macros, so tracking can't start yet. Nothing about your body has been stored.", // C-d2
  declinedBody2:
    "Change your mind any time. Or, if you'd rather not keep an account, you can sign out or delete it.", // C-d3
  reviewConsent: 'REVIEW CONSENT', // C-d4
  deleteAccount: 'Delete account', // C-d4
  deleteConfirm: "This permanently deletes your account and all your data. This can't be undone.", // existing Settings copy
  deleteYes: 'Yes, delete everything',
  deleteFailed: 'Deletion failed. Please try again.',
  cancel: 'Cancel',

  // C-a: about you
  aboutTitle: 'ABOUT YOU', // C-a1
  aboutIntro: 'We use these to estimate your energy needs. They stay private to your account.', // C-a2
  aboutPrefilled: "We've filled in what you gave us before. Check it's still right.", // C-a3
  labels: {
    units: 'Units',
    metric: 'Metric (kg, cm)',
    imperial: 'Imperial (lb, ft)',
    sex: 'Sex (used only to estimate your energy needs)',
    female: 'Female',
    male: 'Male',
    unspecified: 'Prefer not to say',
    birthYear: 'Year of birth',
    heightCm: 'Height (cm)',
    heightFt: 'Height (ft)',
    heightIn: 'Height (in)',
    weightKg: 'Current weight (kg)',
    weightLb: 'Current weight (lb)',
  }, // C-a4
  weightHelper: 'Just a starting point for your estimate.', // C-a5
  placeholders: { birthYear: '1994', heightCm: '170', heightFt: '5', heightIn: '7', weightKg: '70', weightLb: '155' },

  // C-e: validation
  errSex: 'Choose one to continue. Prefer not to say is fine.', // C-e1
  errYearMissing: 'Add your year of birth.', // C-e2
  errYearMalformed: 'Enter a 4-digit year, like 1994.', // C-e3
  errYearEarly: (minYear: number) => `That year looks off. Try ${minYear} or later.`, // C-e4
  errHeightMetric: 'That height looks off. Try between 100 and 250 cm.', // C-e5
  errHeightImperial: 'That height looks off. Try between 3 ft 4 in and 8 ft 2 in.', // C-e6
  errInches: 'Inches go from 0 to 11.', // C-e7
  errWeightMetric: 'That weight looks off. Try between 30 and 350 kg.', // C-e8
  errWeightImperial: 'That weight looks off. Try between 67 and 771 lb.', // C-e9
  errHeightMissing: 'Add your height.', // C-e10
  errWeightMissing: 'Add your weight.', // C-e10

  // C-u: under 16
  underageTitle: 'SEE YOU AT 16', // C-u1
  underageBody:
    "TrustTheProcess is for people 16 and over, so we can't set this up for you yet. Thanks for stopping by, and it's fine to come back when you're 16.", // C-u2
  underageBody2: "We haven't saved your year of birth or any of your answers.", // C-u3
  deleteMyAccount: 'Delete my account', // C-u4
  wrongYear: 'I typed the wrong year', // C-u4

  // C-go: goal
  goalTitle: 'WHAT ARE YOU TRAINING FOR?', // C-go1
  goalIntro: "We'll set your calories and macros from this. You can change it any time.", // C-go2
  goalCards: {
    lose_fat: { title: 'LOSE FAT', description: 'Steady deficit, protein kept high' },
    build_muscle: {
      title: 'BUILD MUSCLE',
      description: 'Small surplus, 1.6 g protein per kg',
      descriptionImperial: 'Small surplus, about 0.7 g protein per lb',
    },
    fuel_performance: {
      title: 'FUEL PERFORMANCE',
      description: 'Eat for your sport, keep weight steady',
    },
    just_track: {
      title: 'JUST TRACK',
      description: 'Log your food, see your patterns. No weight goal.',
    },
  } satisfies Record<
    GoalOption,
    { title: string; description: string; descriptionImperial?: string }
  >, // C-go3
  goalNone: 'Pick one to continue.', // C-go4
  goalGuard:
    "For your age and body, we'll set you up to maintain or build rather than lose. If you have questions about weight or food, a doctor or dietitian is a great person to talk to.", // C-go5
  notAvailable: 'NOT AVAILABLE', // C-go6
  loseUnavailable: 'Lose fat, unavailable. See note above.', // C-go6

  // C-ac: activity
  activityTitle: 'HOW ACTIVE IS YOUR WEEK?', // C-ac1
  activityIntro: 'Count your job and your training together. Pick the closest one.', // C-ac2
  activityCards: {
    sedentary: { title: 'MOSTLY SITTING', description: 'Desk-based day, little planned exercise' },
    light: {
      title: 'LIGHTLY ACTIVE',
      description: 'On your feet some of the day, or 1 to 3 sessions a week',
    },
    moderate: { title: 'MODERATELY ACTIVE', description: '3 to 5 sessions a week' },
    active: {
      title: 'VERY ACTIVE',
      description: 'Hard training 6 to 7 days a week, or a physical job',
    },
    very_active: {
      title: 'ATHLETE',
      description: 'Training twice a day, or a very physical job plus training',
    },
  } satisfies Record<ActivityLevel, { title: string; description: string }>, // C-ac3
  activityNone: 'Pick the closest one to continue.', // C-ac4
  /** Lower-case labels used in the maths sub-line ("BMR 1,370 × 1.375, lightly active"). */
  activityLower: {
    sedentary: 'mostly sitting',
    light: 'lightly active',
    moderate: 'moderately active',
    active: 'very active',
    very_active: 'athlete',
  } satisfies Record<ActivityLevel, string>,
  /** Sentence-case activity labels for list rows and Settings. */
  activityShort: {
    sedentary: 'Mostly sitting',
    light: 'Lightly active',
    moderate: 'Moderately active',
    active: 'Very active',
    very_active: 'Athlete',
  } satisfies Record<ActivityLevel, string>,

  // C-p: pace
  paceTitle: 'PICK YOUR PACE', // C-p1
  paceIntro: 'Choose what fits your life. You can change it any time.', // C-p2
  paceNames: { steady: 'STEADY', moderate: 'MODERATE', faster: 'FASTER' }, // C-p3
  paceRate: (rate: string, unit: UnitSystem) => `${rate} ${unit === 'metric' ? 'kg' : 'lb'} a week`, // C-p3
  paceBelow: (kcal: string) => `About ${kcal} kcal a day below maintenance`, // C-p3
  paceAbove: (kcal: string) => `About ${kcal} kcal a day above maintenance`, // C-p3
  paceFloorHint: (floor: string) => `At your stats, this stops at our ${floor} kcal minimum.`, // C-p4

  // C-p (CR-1): custom pace
  paceCustomTitle: 'CUSTOM',
  paceCustomRange: (unit: UnitSystem) =>
    unit === 'metric' ? '0.01 to 1.5 kg a week' : '0.02 to 3.3 lb a week',
  paceCustomField: (unit: UnitSystem) => (unit === 'metric' ? 'kg a week' : 'lb a week'),
  paceCustomFieldSpoken: (unit: UnitSystem) =>
    `Custom pace in ${unit === 'metric' ? 'kg' : 'lb'} a week`,
  paceCustomError: (unit: UnitSystem) =>
    unit === 'metric'
      ? 'Enter a pace between 0.01 and 1.5 kg a week.'
      : 'Enter a pace between 0.02 and 3.3 lb a week.',
  paceStrongSuggestion: (limit: string) =>
    `We strongly suggest no more than ${limit} a week. Slower is easier to keep up and protects muscle.`,
  paceFaster: (limit: string) =>
    `Faster than we recommend. We strongly suggest ${limit} a week or less. You can still go ahead.`,

  // C-r: reveal
  gameplanTitle: 'YOUR GAME PLAN', // C-r2
  dailyTarget: 'DAILY TARGET', // C-r3
  kcalADay: 'KCAL A DAY', // C-r3
  protein: 'PROTEIN',
  carbs: 'CARBS',
  fat: 'FAT',
  tagCustom: 'CUSTOM', // C-r3
  tagFloor: 'SAFETY MINIMUM', // C-r3
  mathsTitle: 'HOW WE GOT HERE', // C-r4
  rowMaintenance: 'Maintenance (BMR × activity)', // C-r4
  rowMaintenanceSub: (bmr: string, multiplier: number, activity: string) =>
    `BMR ${bmr} × ${multiplier}, ${activity}`, // C-r4
  rowDeficit: 'Deficit for your pace', // C-r4
  rowSurplus: 'Lean-gain surplus', // C-r4
  rowAdjustment: 'Goal adjustment', // C-r4
  rowFloorDeficit: 'Deficit at the safety minimum', // C-r4
  rowFloorDifference: 'Difference from maintenance', // C-r4
  rowCustom: 'Your adjustment', // C-r4
  rowCustomSub: (calculated: string) => `Calculated target was ${calculated}`, // C-r4
  rowTotal: 'Daily target', // C-r4
  rowRounded: 'Rounded to the nearest 10 kcal', // C-r4
  estimateNote:
    'This is a starting estimate. Your body is the real guide, and you can change it any time.', // C-r5
  notMedical: 'Not medical advice.', // C-r6
  letsGo: "LET'S GO", // C-r7
  adjustTargets: 'Adjust targets', // C-r7
  savingPlan: 'Saving your plan', // C-r7
  /** Eyebrow pieces (C-r1). */
  goalName: {
    lose_fat: 'LOSE FAT',
    build_muscle: 'BUILD MUSCLE',
    fuel_performance: 'FUEL PERFORMANCE',
    just_track: 'JUST TRACK',
  } satisfies Record<GoalOption, string>,
  steadyWeight: 'STEADY WEIGHT',
  steadyWeightAtTarget: 'STEADY WEIGHT AT THIS TARGET',
  eyebrowRate: (rate: string, unit: UnitSystem) =>
    `${rate} ${unit === 'metric' ? 'KG' : 'LB'} A WEEK`,
  eyebrowAboutRate: (rate: string, unit: UnitSystem) =>
    `ABOUT ${rate} ${unit === 'metric' ? 'KG' : 'LB'} A WEEK AT THIS TARGET`,
  eyebrowLessThan: (unit: UnitSystem) =>
    `LESS THAN 0.1 ${unit === 'metric' ? 'KG' : 'LB'} A WEEK AT THIS TARGET`,

  // C-f: floor
  floorPace: (floor: string, ratePhrase: string) =>
    `We set your target to ${floor} kcal, a minimum we use for safety. At your stats that means a slower pace than you chose, ${ratePhrase}. If you'd like a faster pace, a doctor or dietitian can help you plan it safely.`, // C-f1
  floorRatePhrase: (rate: string, unit: UnitSystem) =>
    `about ${rate} ${unit === 'metric' ? 'kg' : 'lb'} a week`,
  floorRatePhraseTiny: (unit: UnitSystem) =>
    `less than 0.1 ${unit === 'metric' ? 'kg' : 'lb'} a week`,
  floorMaintenance: (floor: string) =>
    `We set your target to ${floor} kcal, a minimum we use for safety. At your stats that's about your maintenance level, so we don't expect much weight change at this target. A doctor or dietitian can help you plan a different approach.`, // C-f2

  // C-sv: save
  saveOffline: "You're offline, so we couldn't save your plan yet. Your answers are still here.", // C-sv1
  saveServer: "We couldn't save your plan just now. Your answers are still here.", // C-sv2
  saveValidation: "Something in your answers didn't go through. Check About you and try again.", // C-sv3
  reviewAnswers: 'Review answers', // C-sv3

  // C-j: adjust sheet
  adjustTitle: 'ADJUST YOUR PLAN', // C-j1
  rowGoal: 'Goal', // C-j1
  rowPace: 'Pace', // C-j1
  rowActivity: 'Activity', // C-j1
  rowAbout: 'About you', // C-j1
  dailyCalories: 'DAILY CALORIES', // C-j1
  close: 'Close', // C-j1
  back: 'Back', // C-j1
  done: 'DONE', // C-j1
  calculatedLine: (n: string) => `Calculated: ${n} kcal`, // C-j2
  customLine: (n: string) => `Custom · calculated was ${n}`, // C-j2
  useCalculated: 'Use calculated', // C-j2
  proteinStays: (p: number) => `Protein stays at ${p} g. Carbs and fat adjust to match.`, // C-j3
  proteinCapped: (p: number) =>
    `Protein is capped at 35% of calories at this level, so it's ${p} g.`, // C-j3
  floorLowest: (floor: string) =>
    `${floor} kcal is the lowest target we set in the app. If you'd like to go lower, a doctor or dietitian can help you do it safely.`, // C-j4
  kcalTooHigh: (max: string) => `That looks high. Try up to ${max} kcal.`, // D8 item 6 (cap)
  inputsChanged: 'Your inputs changed, so we recalculated your target.', // C-j5
  chooseGoal: 'Choose a goal', // C-j6
  chooseAnotherGoal: 'Choose another goal to continue.', // C-j6
  stepperLabel: (n: string) => `Daily calories, ${n} kcal. Adjustable.`, // C-j7
  increaseBy: (n: number) => `Increase by ${n}`, // C-j7
  decreaseBy: (n: number) => `Decrease by ${n}`, // C-j7

  // C-t: Today
  todayTarget: "TODAY'S TARGET", // C-t1
  kcal: 'KCAL', // C-t1
  planSet: 'Your plan is set. Food logging lands here next.', // C-t1
  planSaved: "Plan saved. Let's get going.", // C-t1
  loggedOf: (n: string) => `0 of ${n} kcal logged`, // C-t1

  // C-st: Settings
  dailyTargetsTitle: 'DAILY TARGETS', // C-st1
  inEffectSince: (d: string) => `In effect since ${d}`, // C-st1
  editTargets: 'Edit targets', // C-st1
  steadyWeightShort: 'Steady weight', // C-st2
  consentOff: "Health-data consent is off. If you edit your targets, we'll ask for it again.", // C-st3
  newTargetsInEffect: 'New targets in effect from today.', // C-st4
  saved: 'Saved', // C-st4

  // C-ed: edit sheet
  editTitle: 'EDIT YOUR TARGETS', // C-ed1
  oldNewKcal: (a: string, b: string) => `${a} → ${b} kcal`, // C-ed1
  applyFromToday: 'APPLY FROM TODAY', // C-ed1
  appliesFrom: (d: string) => `Applies from today, ${d}. Earlier days keep the targets they had.`, // C-ed2
  changeSomething: 'Change something above to see your new targets.', // C-ed3
  replacesCustom: (n: string) => `This replaces your custom target of ${n} kcal.`, // C-ed4
  discardTitle: 'Discard your changes?', // C-ed5
  discard: 'Discard', // C-ed5
  keepEditing: 'Keep editing', // C-ed5
  consentDeclinedInSettings:
    "We need your consent to save body stats. Your targets haven't changed.", // C-ed6
  applyOffline:
    "You're offline, so your new targets aren't saved yet. Your changes are still here.", // C-ed7
  applyServer: "We couldn't save your new targets just now. Your changes are still here.", // C-ed7
  underageEdit: 'You need to be 16 or over to use TrustTheProcess. Check the year.', // C-ed8
} as const;
