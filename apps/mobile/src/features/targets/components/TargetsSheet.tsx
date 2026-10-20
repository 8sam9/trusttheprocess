import {
  GOAL_FOR_OPTION,
  MANUAL_KCAL_STEP,
  applyManualKcal,
  localDateIn,
  manualKcalBounds,
} from '@ttp/shared';
import { space } from '@ttp/ui';
import { useReducer, useState } from 'react';
import { View } from 'react-native';
import { Button, ListRow, MacroTrio, Notice, Sheet, Stepper, Text } from '@/components/ui';
import { track } from '@/lib/analytics';
import { formatInt, formatWeekdayDay } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { deviceTimeZone } from '@/lib/locale';
import type { SaveFailure } from '../api';
import { copy } from '../copy';
import {
  activitySummary,
  aboutSummary,
  buildPlan,
  changedKinds,
  goalSummary,
  isGuarded,
  paceSummary,
  type PlanModel,
} from '../derive';
import { draftReducer, draftSignature, presetKg, type TargetsDraft } from '../draft';
import { validatePace } from '../validate';
import { AboutYouForm, useAboutValidation } from './AboutYouForm';
import { ConsentBody } from './Consent';
import { ActivityOptions, GoalOptions, PaceOptions } from './Options';
import { MathsCard, planMacros } from './PlanParts';

type Page = 'list' | 'goal' | 'pace' | 'activity' | 'about' | 'consent';

export interface StoredTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isCustom: boolean;
}

export type ApplyOutcome = 'ok' | SaveFailure;

export interface TargetsSheetProps {
  /** `onboarding` is the Adjust sheet (commits to the draft); `settings` is the Edit sheet (previews, then applies). */
  mode: 'onboarding' | 'settings';
  /** Where the working copy starts: the onboarding draft, or the profile plus current targets. */
  seed: TargetsDraft;
  /** Settings: the saved targets, shown as the "old" side of old to new. */
  stored?: StoredTargets;
  /** Settings: whether the server holds health-data consent (AC 10). */
  hasConsent?: boolean;
  /** Settings: IANA zone used for the "applies from today" line. */
  timeZone?: string;
  onClose: () => void;
  /** Onboarding: DONE hands the working copy back. */
  onCommit?: (draft: TargetsDraft) => void;
  /** Settings: runs apply_targets and reports how it went. */
  onApply?: (
    draft: TargetsDraft,
    plan: PlanModel,
    opts: { giveConsent: boolean },
  ) => Promise<ApplyOutcome>;
}

const PAGE_TITLES: Record<Exclude<Page, 'list'>, string> = {
  goal: copy.rowGoal,
  pace: copy.rowPace,
  activity: copy.rowActivity,
  about: copy.rowAbout,
  consent: copy.consentTitle,
};

/**
 * S7 (Adjust, onboarding) and S10 (Edit targets, Settings): one component editing a working copy of the draft.
 * Nothing is saved while editing; DONE commits to the draft and APPLY FROM TODAY saves. Dismissing while dirty
 * asks to discard first.
 */
export function TargetsSheet(props: TargetsSheetProps) {
  const { mode, seed, stored, hasConsent = true, onClose, onCommit, onApply } = props;
  const settings = mode === 'settings';
  const [work, dispatch] = useReducer(draftReducer, seed);
  const [page, setPage] = useState<Page>('list');
  const [limit, setLimit] = useState<'floor' | 'max' | null>(null);
  const [applying, setApplying] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [consentOk, setConsentOk] = useState(false);
  const [consentDeclined, setConsentDeclined] = useState(false);
  const [paceAttempted, setPaceAttempted] = useState(false);
  const aboutValidation = useAboutValidation(work);
  // Cancel with changes asks to discard through the same confirm as Close.
  const [discardToken, setDiscardToken] = useState(0);

  const plan = buildPlan(work);
  const dirty = draftSignature(work) !== draftSignature(seed);
  const guardBlocks = work.goalOption === 'lose_fat' && isGuarded(work);
  const seedKcalCustom = seed.customKcal;
  const today = localDateIn(props.timeZone ?? deviceTimeZone());

  // ---- manual calories -------------------------------------------------------------------------
  const onKcal = (requested: number) => {
    if (!plan) return;
    const res = applyManualKcal(plan.breakdown, requested, plan.input);
    dispatch({
      type: 'setCustomKcal',
      kcal: res.kcal === plan.breakdown.calculatedKcal ? null : res.kcal,
    });
    setLimit(res.clamped);
    if (res.clamped === 'floor') {
      haptics.light();
      track({ name: 'targets_manual_override', direction: 'blocked_by_floor' });
    } else if (res.kcal !== plan.final.kcal) {
      track({
        name: 'targets_manual_override',
        direction: res.kcal > plan.final.kcal ? 'up' : 'down',
      });
    }
  };

  // ---- page navigation -------------------------------------------------------------------------
  const openPage = (p: Exclude<Page, 'list' | 'consent'>) => {
    setPaceAttempted(false);
    setPage(p);
  };
  /** DONE on a pushed page: validate it, then go back to the list. */
  const donePage = () => {
    if (page === 'about') {
      const result = aboutValidation.submit();
      if (!result.ok) {
        if (result.underage) aboutValidation.showErrors({ birthYear: copy.underageEdit });
        return;
      }
    }
    if (page === 'pace' && work.goalOption) {
      const goal = GOAL_FOR_OPTION[work.goalOption];
      if (goal !== 'maintain') {
        const r = validatePace(work.pace, work.units, (id) => presetKg(goal, work.units, id));
        if (r.error) {
          setPaceAttempted(true);
          return;
        }
      }
    }
    setPage('list');
  };

  const commit = () => {
    if (!plan) return;
    onCommit?.(work);
  };

  // ---- settings: apply -------------------------------------------------------------------------
  const runApply = async (giveConsent: boolean) => {
    if (!plan || !onApply) return;
    setApplying(true);
    setFailure(null);
    const outcome = await onApply(work, plan, { giveConsent });
    setApplying(false);
    if (outcome === 'ok') {
      haptics.success();
      const changed = changedKinds(seed, work, seedKcalCustom);
      if (changed.length > 0) track({ name: 'targets_updated', changed, source: 'settings' });
      onClose();
    } else {
      setFailure(outcome);
    }
  };
  const onApplyPress = () => {
    setConsentDeclined(false);
    if (!hasConsent && !consentOk) setPage('consent');
    else void runApply(!hasConsent);
  };

  // ---- rendering -------------------------------------------------------------------------------
  const title =
    page === 'list' ? (settings ? copy.editTitle : copy.adjustTitle) : PAGE_TITLES[page];

  const body = (() => {
    if (page === 'goal') {
      return (
        <GoalOptions
          draft={work}
          dispatch={dispatch}
          guarded={isGuarded(work)}
          selected={guardBlocks ? null : work.goalOption}
        />
      );
    }
    if (page === 'pace') {
      return <PaceOptions draft={work} dispatch={dispatch} showErrors={paceAttempted} />;
    }
    if (page === 'activity') return <ActivityOptions draft={work} dispatch={dispatch} />;
    if (page === 'about') {
      return (
        <AboutYouForm
          draft={work}
          dispatch={dispatch}
          errors={aboutValidation.errors}
          focus={aboutValidation.focus}
          onBlur={aboutValidation.onBlur}
          onSubmit={donePage}
        />
      );
    }
    if (page === 'consent') return <ConsentBody inSheet returning />;
    return renderList();
  })();

  function renderList() {
    const goalValue = guardBlocks ? copy.chooseGoal : (goalSummary(work) ?? copy.chooseGoal);
    const maintain = work.goalOption ? GOAL_FOR_OPTION[work.goalOption] === 'maintain' : false;
    const bounds = plan ? manualKcalBounds(plan.input.sex, plan.breakdown.calculatedKcal) : null;
    const showPreview = settings && dirty && plan;

    return (
      <View pointerEvents={applying ? 'none' : 'auto'} style={{ gap: space.md }}>
        {plan ? (
          <View style={{ gap: space.xs }}>
            {showPreview && stored ? (
              <>
                <Text variant="number" accessibilityRole="header">
                  {copy.oldNewKcal(formatInt(stored.kcal), formatInt(plan.final.kcal))}
                </Text>
                <MacroTrio
                  macros={planMacros(plan)}
                  previous={{ proteinG: stored.proteinG, carbsG: stored.carbsG, fatG: stored.fatG }}
                />
              </>
            ) : (
              <>
                <Text variant="number">{`${formatInt(plan.final.kcal)} kcal`}</Text>
                <MacroTrio macros={planMacros(plan)} compact />
              </>
            )}
          </View>
        ) : null}

        {guardBlocks ? <Notice>{copy.goalGuard}</Notice> : null}

        <View>
          <ListRow
            label={copy.rowGoal}
            value={goalValue}
            valueTone={guardBlocks ? 'danger' : 'muted'}
            onPress={() => openPage('goal')}
          />
          {!maintain && work.goalOption ? (
            <ListRow
              label={copy.rowPace}
              value={paceSummary(work)}
              onPress={() => openPage('pace')}
            />
          ) : null}
          <ListRow
            label={copy.rowActivity}
            value={activitySummary(work)}
            onPress={() => openPage('activity')}
          />
          <ListRow
            label={copy.rowAbout}
            value={aboutSummary(work)}
            onPress={() => openPage('about')}
          />
        </View>

        {plan && bounds ? (
          <View style={{ gap: space.xs }}>
            <Text variant="label" tone="muted">
              {copy.dailyCalories}
            </Text>
            <Stepper
              value={plan.final.kcal}
              onChange={onKcal}
              min={bounds.min}
              max={bounds.max}
              step={MANUAL_KCAL_STEP}
              label={copy.stepperLabel(formatInt(plan.final.kcal))}
            />
            <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>
              {plan.isCustom
                ? copy.customLine(formatInt(plan.breakdown.calculatedKcal))
                : copy.calculatedLine(formatInt(plan.breakdown.calculatedKcal))}
            </Text>
            {plan.isCustom ? (
              <Button
                variant="text"
                label={copy.useCalculated}
                onPress={() => {
                  setLimit(null);
                  dispatch({ type: 'setCustomKcal', kcal: null });
                }}
              />
            ) : null}
            {limit === 'floor' ? (
              <Notice live>{copy.floorLowest(formatInt(bounds.min))}</Notice>
            ) : limit === 'max' ? (
              <Notice live>{copy.kcalTooHigh(formatInt(bounds.max))}</Notice>
            ) : null}
            <Text variant="small" tone="muted">
              {plan.final.proteinCapped
                ? copy.proteinCapped(plan.final.proteinG)
                : copy.proteinStays(plan.final.proteinG)}
            </Text>
          </View>
        ) : null}

        {work.recalculatedNotice && !work.customKcal ? (
          <Notice live>{copy.inputsChanged}</Notice>
        ) : null}
        {settings && dirty && stored?.isCustom && !plan?.isCustom ? (
          <Text variant="small" tone="muted">
            {copy.replacesCustom(formatInt(stored.kcal))}
          </Text>
        ) : null}

        {showPreview && plan ? <MathsCard plan={plan} /> : null}
        {settings && plan ? (
          <Text variant="small" tone="muted">
            {dirty ? copy.appliesFrom(formatWeekdayDay(today)) : copy.changeSomething}
          </Text>
        ) : null}

        {!plan && guardBlocks ? <Notice live>{copy.chooseAnotherGoal}</Notice> : null}
      </View>
    );
  }

  // ---- footer ----------------------------------------------------------------------------------
  const footer = (() => {
    if (page === 'consent') {
      return (
        <>
          <Button
            label={copy.agree}
            loading={applying}
            busyLabel={copy.savingPlan}
            onPress={() => {
              track({ name: 'health_consent_decided', decision: 'given', surface: 'settings' });
              setConsentOk(true);
              setPage('list');
              void runApply(true);
            }}
          />
          <Button
            label={copy.noThanks}
            variant="secondary"
            size="cta"
            onPress={() => {
              track({ name: 'health_consent_decided', decision: 'declined', surface: 'settings' });
              setConsentDeclined(true);
              setPage('list');
            }}
          />
        </>
      );
    }
    if (page !== 'list') {
      return <Button label={copy.done} onPress={donePage} />;
    }
    if (settings) {
      return (
        <>
          <Button
            label={failure ? copy.tryAgain : copy.applyFromToday}
            loading={applying}
            busyLabel={copy.savingPlan}
            disabled={!dirty || !plan}
            onPress={onApplyPress}
          />
          <Button
            label={copy.cancel}
            variant="secondary"
            size="cta"
            disabled={applying}
            onPress={() => (dirty ? setDiscardToken((n) => n + 1) : onClose())}
          />
        </>
      );
    }
    return <Button label={copy.done} disabled={!plan} onPress={commit} />;
  })();

  // Pinned above the footer (not in the scrolling list) so a failure is visible wherever the list is scrolled.
  const notice =
    page !== 'list' ? undefined : consentDeclined ? (
      <Notice live>{copy.consentDeclinedInSettings}</Notice>
    ) : failure ? (
      <Notice tone="danger" live>
        {failure === 'offline'
          ? copy.applyOffline
          : failure === 'validation'
            ? copy.saveValidation
            : copy.applyServer}
      </Notice>
    ) : undefined;

  return (
    <Sheet
      visible
      title={title}
      dirty={dirty}
      onClose={onClose}
      {...(page !== 'list' ? { onBack: donePage } : {})}
      discard={{ title: copy.discardTitle, discard: copy.discard, keep: copy.keepEditing }}
      discardToken={discardToken}
      notice={notice}
      footer={footer}
    >
      {body}
    </Sheet>
  );
}
