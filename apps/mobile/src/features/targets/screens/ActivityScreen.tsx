import { GOAL_FOR_OPTION } from '@ttp/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Button, Notice, StepHeader, TaskScreen, Text } from '@/components/ui';
import { copy } from '../copy';
import { ActivityOptions } from '../components/Options';
import { effectiveGoalOption } from '../derive';
import { useBackCounter, useStepGuard, useStepViewed } from '../hooks';
import { useOnboarding } from '../OnboardingProvider';

/** S4, step 3 of 5. Maintain goals skip the pace step and go straight to the reveal (AC 7). */
export default function ActivityScreen() {
  const { draft, dispatch } = useOnboarding();
  const redirect = useStepGuard('activity');
  const [attempted, setAttempted] = useState(false);
  useStepViewed('activity');
  useBackCounter();
  if (redirect) return <Redirect href={redirect} />;

  const goalOption = effectiveGoalOption(draft);
  const onContinue = () => {
    if (draft.activity === null || goalOption === null) {
      setAttempted(true);
      return;
    }
    router.push(GOAL_FOR_OPTION[goalOption] === 'maintain' ? '/onboarding/plan' : '/onboarding/pace');
  };
  return (
    <TaskScreen
      header={<StepHeader step={3} />}
      notice={attempted && draft.activity === null ? <Notice live>{copy.activityNone}</Notice> : undefined}
      primary={<Button label={copy.continue} onPress={onContinue} />}
    >
      <Text variant="display">{copy.activityTitle}</Text>
      <Text variant="bodyRegular" tone="muted">
        {copy.activityIntro}
      </Text>
      <ActivityOptions draft={draft} dispatch={dispatch} />
    </TaskScreen>
  );
}
