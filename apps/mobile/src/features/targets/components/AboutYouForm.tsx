import { space } from '@ttp/ui';
import { useEffect, useRef, useState, type Dispatch, type RefObject } from 'react';
import { InputAccessoryView, Platform, View, type TextInputInstance } from 'react-native';
import { Button, Choice, TextField } from '@/components/ui';
import { useLargeText } from '@/lib/a11y';
import { copy } from '../copy';
import type { DraftAction, TargetsDraft } from '../draft';
import { validateAbout, type AboutErrors, type AboutField, type AboutResult } from '../validate';

const ACCESSORY_ID = 'ttp-about-you-accessory';

/**
 * Validation state for the About you form: nothing is shown until the first attempt, then errors refresh on
 * every submit and blur (D2). CONTINUE is never disabled, so pressing it always gives feedback.
 */
export function useAboutValidation(draft: TargetsDraft) {
  const [attempted, setAttempted] = useState(false);
  const [errors, setErrors] = useState<AboutErrors>({});
  const [tick, setTick] = useState(0);
  const [focus, setFocus] = useState<{ field: AboutField; n: number } | null>(null);

  useEffect(() => {
    if (attempted) {
      const r = validateAbout(draft);
      setErrors(r.ok ? {} : r.errors);
    }
    // Refresh on blur ticks and unit changes only, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, attempted, draft.units]);

  return {
    errors,
    focus,
    onBlur: () => setTick((t) => t + 1),
    /** Validates now; shows the errors and moves focus to the first invalid field. */
    submit(): AboutResult {
      const result = validateAbout(draft);
      setAttempted(true);
      setErrors(result.ok ? {} : result.errors);
      if (!result.ok && result.first && !result.underage) {
        setFocus({ field: result.first, n: (focus?.n ?? 0) + 1 });
      }
      return result;
    },
    /** Shows a specific error (for example the under-16 message inside a sheet). */
    showErrors(next: AboutErrors) {
      setAttempted(true);
      setErrors(next);
    },
  };
}

export function AboutYouForm({
  draft,
  dispatch,
  errors,
  focus,
  onBlur,
  onSubmit,
  autoFocusYear,
}: {
  draft: TargetsDraft;
  dispatch: Dispatch<DraftAction>;
  errors: AboutErrors;
  focus: { field: AboutField; n: number } | null;
  onBlur: () => void;
  onSubmit: () => void;
  autoFocusYear?: boolean;
}) {
  const large = useLargeText();
  const year = useRef<TextInputInstance>(null);
  const heightCm = useRef<TextInputInstance>(null);
  const heightFt = useRef<TextInputInstance>(null);
  const heightIn = useRef<TextInputInstance>(null);
  const weight = useRef<TextInputInstance>(null);
  const imperial = draft.units === 'imperial';
  const order = imperial ? [year, heightFt, heightIn, weight] : [year, heightCm, weight];

  useEffect(() => {
    if (!focus) return;
    const target =
      focus.field === 'birthYear'
        ? year
        : focus.field === 'weight'
          ? weight
          : focus.field === 'heightIn'
            ? heightIn
            : imperial
              ? heightFt
              : heightCm;
    target.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  const moveFrom = (current: RefObject<TextInputInstance | null>, delta: number) => {
    const i = order.indexOf(current);
    order[i + delta]?.current?.focus();
  };
  const next = (current: RefObject<TextInputInstance | null>) => () => {
    if (current === weight) onSubmit();
    else moveFrom(current, 1);
  };

  const L = copy.labels;
  const ph = copy.placeholders;
  const common = {
    onBlur,
    blurOnSubmit: false,
    autoComplete: 'off' as const,
  };

  return (
    <View style={{ gap: space.md }}>
      <Choice
        label={L.units}
        value={draft.units}
        options={[
          { value: 'metric', label: L.metric },
          { value: 'imperial', label: L.imperial },
        ]}
        onChange={(units) => dispatch({ type: 'setUnits', units })}
      />
      <Choice
        label={L.sex}
        value={draft.sex}
        options={[
          { value: 'female', label: L.female },
          { value: 'male', label: L.male },
          { value: 'unspecified', label: L.unspecified },
        ]}
        onChange={(sex) => dispatch({ type: 'setSex', sex })}
        error={errors.sex}
      />
      <TextField
        ref={year}
        label={L.birthYear}
        value={draft.birthYear}
        onChangeText={(t) => dispatch({ type: 'setField', field: 'birthYear', value: t.replace(/\D/g, '') })}
        keyboardType="number-pad"
        maxLength={4}
        placeholder={ph.birthYear}
        returnKeyType="next"
        onSubmitEditing={next(year)}
        autoFocus={autoFocusYear}
        inputAccessoryViewID={ACCESSORY_ID}
        error={errors.birthYear}
        {...common}
      />
      {imperial ? (
        <View style={{ flexDirection: large ? 'column' : 'row', gap: space.md }}>
          <View style={{ flex: large ? undefined : 1 }}>
            <TextField
              ref={heightFt}
              label={L.heightFt}
              value={draft.heightFt}
              onChangeText={(t) =>
                dispatch({ type: 'setField', field: 'heightFt', value: t.replace(/\D/g, '') })
              }
              keyboardType="number-pad"
              maxLength={1}
              placeholder={ph.heightFt}
              returnKeyType="next"
              onSubmitEditing={next(heightFt)}
              inputAccessoryViewID={ACCESSORY_ID}
              error={errors.height}
              {...common}
            />
          </View>
          <View style={{ flex: large ? undefined : 1 }}>
            <TextField
              ref={heightIn}
              label={L.heightIn}
              value={draft.heightIn}
              onChangeText={(t) =>
                dispatch({ type: 'setField', field: 'heightIn', value: t.replace(/\D/g, '') })
              }
              keyboardType="number-pad"
              maxLength={2}
              placeholder={ph.heightIn}
              returnKeyType="next"
              onSubmitEditing={next(heightIn)}
              inputAccessoryViewID={ACCESSORY_ID}
              error={errors.heightIn}
              {...common}
            />
          </View>
        </View>
      ) : (
        <TextField
          ref={heightCm}
          label={L.heightCm}
          value={draft.heightCm}
          onChangeText={(t) => dispatch({ type: 'setField', field: 'heightCm', value: t.replace(/[^\d.,]/g, '') })}
          keyboardType="number-pad"
          maxLength={5}
          placeholder={ph.heightCm}
          returnKeyType="next"
          onSubmitEditing={next(heightCm)}
          inputAccessoryViewID={ACCESSORY_ID}
          error={errors.height}
          {...common}
        />
      )}
      <TextField
        ref={weight}
        label={imperial ? L.weightLb : L.weightKg}
        value={draft.weight}
        onChangeText={(t) => dispatch({ type: 'setField', field: 'weight', value: t.replace(/[^\d.,]/g, '') })}
        keyboardType="decimal-pad"
        maxLength={6}
        placeholder={imperial ? ph.weightLb : ph.weightKg}
        returnKeyType="done"
        onSubmitEditing={next(weight)}
        inputAccessoryViewID={ACCESSORY_ID}
        helper={copy.weightHelper}
        error={errors.weight}
        {...common}
      />
      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.xs, padding: space.xs }}>
            <Button variant="text" label="Previous" onPress={() => focusedMove(order, -1)} />
            <Button variant="text" label="Next" onPress={() => focusedMove(order, 1)} />
            <Button variant="text" label="Done" onPress={() => order.forEach((r) => r.current?.blur())} />
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}

function focusedMove(order: RefObject<TextInputInstance | null>[], delta: number): void {
  const i = order.findIndex((r) => r.current?.isFocused());
  order[i + delta]?.current?.focus();
}
