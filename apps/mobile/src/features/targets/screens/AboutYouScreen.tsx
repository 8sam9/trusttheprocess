import { router } from 'expo-router';
import { useEffect } from 'react';
import { Button, StepHeader, TaskScreen, Text } from '@/components/ui';
import { track } from '@/lib/analytics';
import { copy } from '../copy';
import { AboutYouForm, useAboutValidation } from '../components/AboutYouForm';
import { useResetUnderage } from '../api';
import { useStepViewed } from '../hooks';
import { useOnboarding } from '../OnboardingProvider';

/** S2, step 1 of 5. An under-16 birth year stops here: nothing is sent, and stored data is reset. */
export default function AboutYouScreen() {
  const { draft, dispatch, profile } = useOnboarding();
  const resetUnderage = useResetUnderage();
  const validation = useAboutValidation(draft);
  useStepViewed('about_you');

  useEffect(() => {
    if (draft.focusBirthYear) dispatch({ type: 'focusHandled' });
  }, [draft.focusBirthYear, dispatch]);

  const serverHoldsData =
    profile.health_data_consent_at !== null ||
    profile.birth_year !== null ||
    profile.height_cm !== null ||
    profile.weight_kg !== null ||
    profile.sex !== null;

  const onContinue = () => {
    const result = validation.submit();
    if (result.ok) {
      router.push('/onboarding/goal');
    } else if (result.underage) {
      track({ name: 'onboarding_blocked', reason: 'under_min_age' });
      dispatch({ type: 'markUnderage' });
      if (serverHoldsData) void resetUnderage();
    }
  };

  return (
    <TaskScreen
      header={<StepHeader step={1} />}
      primary={<Button label={copy.continue} onPress={onContinue} />}
    >
      <Text variant="display">{copy.aboutTitle}</Text>
      <Text variant="bodyRegular" tone="muted">
        {copy.aboutIntro}
        {draft.prefilled ? ` ${copy.aboutPrefilled}` : ''}
      </Text>
      <AboutYouForm
        draft={draft}
        dispatch={dispatch}
        errors={validation.errors}
        focus={validation.focus}
        onBlur={validation.onBlur}
        onSubmit={onContinue}
        autoFocusYear={draft.focusBirthYear}
      />
    </TaskScreen>
  );
}
