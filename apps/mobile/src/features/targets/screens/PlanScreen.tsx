import { Redirect, Stack, useFocusEffect, usePreventRemove } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Button, Notice, StepHeader, TaskScreen } from '@/components/ui';
import { track } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { deviceTimeZone } from '@/lib/locale';
import { toSaveFailure, useApplyTargets, type SaveFailure } from '../api';
import { copy } from '../copy';
import { TargetsSheet } from '../components/TargetsSheet';
import { PlanBody } from '../components/PlanParts';
import { buildPlan } from '../derive';
import { useBackCounter, useStepGuard, useStepViewed } from '../hooks';
import { useOnboarding } from '../OnboardingProvider';
import { usePlanSaved } from '../planSaved';
import { argsForPlan, durationBucket } from '../save';
import { router } from 'expo-router';

/** S6, step 5 of 5: "Your game plan". LET'S GO runs the single atomic save (AC 11). */
export default function PlanScreen() {
  const { draft, dispatch, serverConsent } = useOnboarding();
  const redirect = useStepGuard('reveal');
  const apply = useApplyTargets();
  const { markSaved } = usePlanSaved();
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const inFlight = useRef(false);
  const saving = apply.isPending;

  const plan = buildPlan(draft);
  const planRef = useRef(plan);
  planRef.current = plan;

  useStepViewed('reveal');
  useBackCounter();
  usePreventRemove(saving, () => {});
  useFocusEffect(
    useCallback(() => {
      const p = planRef.current;
      if (!p) return;
      track({
        name: 'targets_revealed',
        goal: p.input.goal,
        floor_applied: p.breakdown.floorApplied,
        units: p.input.units,
        source: 'onboarding',
        ...(p.paceOption ? { pace_option: p.paceOption } : {}),
        ...(p.paceBand ? { pace_band: p.paceBand } : {}),
      });
    }, []),
  );

  if (redirect) return <Redirect href={redirect} />;
  if (!plan) return null;

  const onLetsGo = async () => {
    if (inFlight.current) return; // double taps must not create a second save
    inFlight.current = true;
    setFailure(null);
    try {
      await apply.mutateAsync(
        argsForPlan(plan, { timezone: deviceTimeZone(), giveConsent: !serverConsent }),
      );
      haptics.success();
      track({
        name: 'onboarding_completed',
        duration_bucket: durationBucket(Date.now() - draft.startedAt),
        back_count: Math.min(5, draft.backCount),
      });
      markSaved();
    } catch (error) {
      const kind = toSaveFailure(error);
      setFailure(kind);
      track({ name: 'onboarding_save_failed', reason: kind, stage: 'final_save' });
    } finally {
      inFlight.current = false;
    }
  };

  const failureText =
    failure === 'offline'
      ? copy.saveOffline
      : failure === 'validation'
        ? copy.saveValidation
        : failure === 'server'
          ? copy.saveServer
          : null;

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !saving, headerBackVisible: !saving }} />
      <TaskScreen
        header={<StepHeader step={5} />}
        notice={
          failureText ? (
            <Notice tone="danger" live>
              {failureText}
            </Notice>
          ) : undefined
        }
        primary={
          <Button
            label={failure ? copy.tryAgain : copy.letsGo}
            loading={saving}
            busyLabel={copy.savingPlan}
            onPress={() => void onLetsGo()}
          />
        }
        secondary={
          failure === 'validation' ? (
            <Button
              label={copy.reviewAnswers}
              variant="text"
              disabled={saving}
              onPress={() => router.navigate('/onboarding/about-you')}
            />
          ) : (
            <Button
              label={copy.adjustTargets}
              variant="text"
              disabled={saving}
              onPress={() => {
                track({ name: 'targets_adjust_opened', source: 'onboarding' });
                setAdjusting(true);
              }}
            />
          )
        }
      >
        <PlanBody plan={plan} />
      </TaskScreen>
      {adjusting ? (
        <TargetsSheet
          mode="onboarding"
          seed={draft}
          onClose={() => setAdjusting(false)}
          onCommit={(next) => {
            dispatch({ type: 'replace', draft: next });
            setAdjusting(false);
          }}
        />
      ) : null}
    </>
  );
}
