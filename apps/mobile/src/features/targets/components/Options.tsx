import { GOAL_FOR_OPTION, type ActivityLevel, type GoalOption } from '@ttp/shared';
import { space } from '@ttp/ui';
import { useEffect, useRef, useState, type Dispatch } from 'react';
import { Platform, View, type TextInputInstance } from 'react-native';
import { Notice, RadioCard, Text, TextField } from '@/components/ui';
import { track } from '@/lib/analytics';
import { copy } from '../copy';
import type { DraftAction, TargetsDraft } from '../draft';
import { customPaceInfo, paceBandFor, paceOptions, recommendedLimitText } from '../derive';
import { validatePace } from '../validate';

const GOAL_ORDER: GoalOption[] = ['lose_fat', 'build_muscle', 'fuel_performance', 'just_track'];
const ACTIVITY_ORDER: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

/** The four goal cards. Lose fat is shown as unavailable (with the note above) when the guard is active (AC 16). */
export function GoalOptions({
  draft,
  dispatch,
  guarded,
  selected,
}: {
  draft: TargetsDraft;
  dispatch: Dispatch<DraftAction>;
  guarded: boolean;
  /** The effective selection (a guarded Lose fat counts as nothing selected). */
  selected: GoalOption | null;
}) {
  const guardReported = useRef(false);
  useEffect(() => {
    if (guarded && !guardReported.current) {
      guardReported.current = true;
      track({ name: 'onboarding_blocked', reason: 'low_bmi_guard' });
    }
  }, [guarded]);

  return (
    <View
      style={{ gap: space.sm }}
      accessibilityRole="radiogroup"
      accessibilityLabel={copy.goalTitle}
    >
      {guarded ? <Notice>{copy.goalGuard}</Notice> : null}
      {GOAL_ORDER.map((option) => {
        const card = copy.goalCards[option];
        const unavailable = option === 'lose_fat' && guarded;
        const description =
          option === 'build_muscle' && draft.units === 'imperial'
            ? copy.goalCards.build_muscle.descriptionImperial
            : card.description;
        return (
          <RadioCard
            key={option}
            title={card.title}
            description={unavailable ? undefined : description}
            selected={selected === option}
            unavailable={unavailable}
            {...(unavailable
              ? { tag: copy.notAvailable, accessibilityLabel: copy.loseUnavailable }
              : {})}
            onPress={() => {
              dispatch({ type: 'setGoal', goal: option });
              track({ name: 'onboarding_goal_selected', goal_option: option });
            }}
          />
        );
      })}
    </View>
  );
}

export function ActivityOptions({
  draft,
  dispatch,
}: {
  draft: TargetsDraft;
  dispatch: Dispatch<DraftAction>;
}) {
  return (
    <View
      style={{ gap: space.sm }}
      accessibilityRole="radiogroup"
      accessibilityLabel={copy.activityTitle}
    >
      {ACTIVITY_ORDER.map((level) => (
        <RadioCard
          key={level}
          title={copy.activityCards[level].title}
          description={copy.activityCards[level].description}
          selected={draft.activity === level}
          onPress={() => dispatch({ type: 'setActivity', activity: level })}
        />
      ))}
    </View>
  );
}

/** The "Faster than we recommend" text when a valid custom pace is above 0.75 kg a week, else null. */
export function paceFasterText(draft: TargetsDraft): string | null {
  if (draft.pace?.kind !== 'custom') return null;
  const { kg } = validatePace(draft.pace, draft.units, () => null);
  return kg !== null && paceBandFor(kg) === 'gt_0_75'
    ? copy.paceFaster(recommendedLimitText(draft.units))
    : null;
}

/**
 * Pinned notice for the pace warning. Callers place it in the footer notice slot (TaskScreen / Sheet) so it is
 * visible on first paint above the action; it is announced politely when it appears.
 */
export function PaceFasterNotice({ draft }: { draft: TargetsDraft }) {
  const text = paceFasterText(draft);
  return text ? (
    <Notice tone="warning" live>
      {text}
    </Notice>
  ) : null;
}

/**
 * Pace cards (S5): presets with live kcal lines, then the CR-1 Custom card. The 0.75 recommendation Notice is
 * always visible (AC 35); a custom value above it turns the outline amber and the message itself is PaceFasterNotice, pinned by the caller (AC 34).
 */
export function PaceOptions({
  draft,
  dispatch,
  showErrors,
}: {
  draft: TargetsDraft;
  dispatch: Dispatch<DraftAction>;
  showErrors: boolean;
}) {
  const option = draft.goalOption;
  const goal = option ? GOAL_FOR_OPTION[option] : 'maintain';
  const units = draft.units;
  const presets = goal === 'maintain' ? [] : paceOptions(draft, goal);
  const customSelected = draft.pace?.kind === 'custom';
  const customText = draft.pace?.kind === 'custom' ? draft.pace.text : '';
  const customResult = customSelected
    ? validatePace(draft.pace, units, () => null)
    : { error: null, kg: null };
  const faster = customResult.kg !== null && paceBandFor(customResult.kg) === 'gt_0_75';
  const info =
    customResult.kg !== null && goal !== 'maintain'
      ? customPaceInfo(draft, goal, customResult.kg)
      : null;
  const limit = recommendedLimitText(units);
  // Selecting Custom reveals the input and focuses it (autoFocus), so the keyboard or browser brings it into view.
  const [focusCustom, setFocusCustom] = useState(false);
  const customInput = useRef<TextInputInstance>(null);
  useEffect(() => {
    if (!customSelected || !focusCustom || Platform.OS !== 'web') return;
    (
      customInput.current as unknown as { scrollIntoView?: (o: object) => void } | null
    )?.scrollIntoView?.({ block: 'center' });
  }, [customSelected, focusCustom, faster]); // `faster` adds the pinned notice, which shrinks the scroll area

  if (goal === 'maintain') return null;

  return (
    <View
      style={{ gap: space.sm }}
      accessibilityRole="radiogroup"
      accessibilityLabel={copy.paceTitle}
    >
      <Notice>{copy.paceStrongSuggestion(limit)}</Notice>
      {presets.map((p) => (
        <RadioCard
          key={p.id}
          title={p.title}
          rate={p.rate}
          description={p.kcalLine}
          {...(p.hint ? { hint: p.hint } : {})}
          selected={draft.pace?.kind === 'preset' && draft.pace.id === p.id}
          onPress={() => dispatch({ type: 'setPace', pace: { kind: 'preset', id: p.id } })}
        />
      ))}
      <RadioCard
        title={copy.paceCustomTitle}
        rate={copy.paceCustomRange(units)}
        selected={customSelected}
        tone={faster ? 'warning' : 'default'}
        accessibilityLabel={`Custom. ${copy.paceCustomRange(units)}.`}
        onPress={() => {
          if (!customSelected) {
            setFocusCustom(true);
            dispatch({ type: 'setCustomPaceText', text: '' });
          }
        }}
      >
        <TextField
          ref={customInput}
          autoFocus={focusCustom}
          label={copy.paceCustomField(units)}
          accessibilityLabel={copy.paceCustomFieldSpoken(units)}
          value={customText}
          onChangeText={(t) =>
            dispatch({ type: 'setCustomPaceText', text: t.replace(/[^\d.,]/g, '').slice(0, 5) })
          }
          keyboardType="decimal-pad"
          placeholder={units === 'metric' ? '0.5' : '1'}
          error={showErrors && customResult.error ? customResult.error : undefined}
        />
        {info ? (
          <Text variant="small" tone="muted">
            {info.kcalLine}
          </Text>
        ) : null}
        {info?.hint ? <Text variant="small">{info.hint}</Text> : null}
      </RadioCard>
    </View>
  );
}
