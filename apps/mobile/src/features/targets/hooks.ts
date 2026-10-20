import type { Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { track } from '@/lib/analytics';
import { GOAL_FOR_OPTION } from '@ttp/shared';
import { buildPlan, effectiveGoalOption } from './derive';
import { validateAbout, validatePace } from './validate';
import { presetKg } from './draft';
import { useOnboarding } from './OnboardingProvider';

export type OnboardingStep = 'consent' | 'about_you' | 'goal' | 'activity' | 'pace' | 'reveal';

/**
 * Emits `onboarding_step_viewed` each time the step comes into focus, and counts a return to a step that was
 * already shown (the user went back to it) for `onboarding_completed.back_count`. `enabled` is false while the
 * screen is only redirecting to an earlier step, so a screen the user never saw is not reported.
 */
export function useStepViewed(step: OnboardingStep, enabled = true): void {
  const { dispatch } = useOnboarding();
  const shownBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      track({ name: 'onboarding_step_viewed', step });
      if (step !== 'consent' && shownBefore.current) dispatch({ type: 'back' });
      shownBefore.current = true;
    }, [enabled, step, dispatch]),
  );
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
  if (
    goal !== 'maintain' &&
    validatePace(draft.pace, draft.units, (id) => presetKg(goal, draft.units, id)).error
  ) {
    return '/onboarding/pace';
  }
  return buildPlan(draft) ? null : '/onboarding/about-you';
}
