import type { Href } from 'expo-router';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { track } from '@/lib/analytics';
import { GOAL_FOR_OPTION } from '@ttp/shared';
import { buildPlan, effectiveGoalOption } from './derive';
import { validateAbout, validatePace } from './validate';
import { presetKg } from './draft';
import { useOnboarding } from './OnboardingProvider';

export type OnboardingStep = 'consent' | 'about_you' | 'goal' | 'activity' | 'pace' | 'reveal';

/** Emits `onboarding_step_viewed` each time the step comes into focus. */
export function useStepViewed(step: OnboardingStep): void {
  useFocusEffect(
    useCallback(() => {
      track({ name: 'onboarding_step_viewed', step });
    }, [step]),
  );
}

/** Counts back navigations for `onboarding_completed.back_count` (swipe, hardware back and the header button). */
export function useBackCounter(): void {
  // expo-router types the navigation prop with a narrow event map; `beforeRemove` exists at runtime.
  const navigation = useNavigation() as unknown as {
    addListener: (
      type: 'beforeRemove',
      listener: (e: { data: { action: { type: string } } }) => void,
    ) => () => void;
  };
  const { dispatch } = useOnboarding();
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      const type = e.data.action.type;
      if (type === 'POP' || type === 'GO_BACK') dispatch({ type: 'back' });
    });
  }, [navigation, dispatch]);
}

/**
 * Deep links and web refreshes can open a step with an empty draft. Returns the earliest step whose
 * prerequisites are missing, or null when this step may be shown.
 */
export function useStepGuard(step: 'goal' | 'activity' | 'pace' | 'reveal'): Href | null {
  const { draft } = useOnboarding();
  if (!validateAbout(draft).ok) return '/onboarding/about-you';
  if (step === 'goal') return null;
  const goalOption = effectiveGoalOption(draft);
  if (goalOption === null) return '/onboarding/goal';
  if (step === 'activity') return null;
  if (draft.activity === null) return '/onboarding/activity';
  const goal = GOAL_FOR_OPTION[goalOption];
  if (step === 'pace') return goal === 'maintain' ? '/onboarding/plan' : null;
  if (goal !== 'maintain' && validatePace(draft.pace, draft.units, (id) => presetKg(goal, draft.units, id)).error) {
    return '/onboarding/pace';
  }
  return buildPlan(draft) ? null : '/onboarding/about-you';
}
