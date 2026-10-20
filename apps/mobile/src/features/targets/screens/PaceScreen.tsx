import { GOAL_FOR_OPTION } from '@ttp/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Button, StepHeader, TaskScreen, Text } from '@/components/ui';
import { copy } from '../copy';
import { PaceFasterNotice, PaceOptions } from '../components/Options';
import { presetKg } from '../draft';
import { goBackStep, useStepGuard, useStepViewed } from '../hooks';
import { useOnboarding } from '../OnboardingProvider';
import { validatePace } from '../validate';

/** S5, step 4 of 5 (lose or gain only), with the CR-1 custom pace. CONTINUE is blocked for an invalid custom value. */
export default function PaceScreen() {
  const { draft, dispatch } = useOnboarding();
  const redirect = useStepGuard('pace');
  const [attempted, setAttempted] = useState(false);
  useStepViewed('pace', !redirect);
  if (redirect) return <Redirect href={redirect} />;

  const goal = draft.goalOption ? GOAL_FOR_OPTION[draft.goalOption] : 'maintain';
  const onContinue = () => {
    const result = validatePace(draft.pace, draft.units, (id) =>
      goal === 'maintain' ? null : presetKg(goal, draft.units, id),
    );
    if (result.error) setAttempted(true);
    else router.push('/onboarding/plan');
  };
  return (
    <TaskScreen
      header={<StepHeader step={4} onBack={goBackStep} />}
      notice={<PaceFasterNotice draft={draft} />}
      primary={<Button label={copy.continue} onPress={onContinue} />}
    >
      <Text variant="display">{copy.paceTitle}</Text>
      <Text variant="bodyRegular" tone="muted">
        {copy.paceIntro}
      </Text>
      <PaceOptions draft={draft} dispatch={dispatch} showErrors={attempted} />
    </TaskScreen>
  );
}
