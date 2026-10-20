import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Button, Notice, StepHeader, TaskScreen, Text } from '@/components/ui';
import { copy } from '../copy';
import { GoalOptions } from '../components/Options';
import { effectiveGoalOption, isGuarded } from '../derive';
import { useStepGuard, useStepViewed } from '../hooks';
import { useOnboarding } from '../OnboardingProvider';

/** S3, step 2 of 5. Radio cards; Lose fat is unavailable when the age or BMI guard is active (AC 16). */
export default function GoalScreen() {
  const { draft, dispatch } = useOnboarding();
  const redirect = useStepGuard('goal');
  const [attempted, setAttempted] = useState(false);
  useStepViewed('goal', !redirect);
  if (redirect) return <Redirect href={redirect} />;

  const selected = effectiveGoalOption(draft);
  const onContinue = () => {
    if (selected === null) setAttempted(true);
    else router.push('/onboarding/activity');
  };
  return (
    <TaskScreen
      header={<StepHeader step={2} />}
      notice={attempted && selected === null ? <Notice live>{copy.goalNone}</Notice> : undefined}
      primary={<Button label={copy.continue} onPress={onContinue} />}
    >
      <Text variant="display">{copy.goalTitle}</Text>
      <Text variant="bodyRegular" tone="muted">
        {copy.goalIntro}
      </Text>
      <GoalOptions
        draft={draft}
        dispatch={dispatch}
        guarded={isGuarded(draft)}
        selected={selected}
      />
    </TaskScreen>
  );
}
