import { space } from '@ttp/ui';
import { useEffect, useRef, useState, type Dispatch } from 'react';
import { View, type TextInputInstance } from 'react-native';
import { Choice, TextField } from '@/components/ui';
import { useLargeText } from '@/lib/a11y';
import { copy } from '../copy';
import type { DraftAction, TargetsDraft } from '../draft';
import { validateAbout, type AboutErrors, type AboutField, type AboutResult } from '../validate';

/**
 * Validation state for the About you form: nothing is shown until the first attempt, then errors refresh on
 * every submit and blur (D2). CONTINUE is never disabled, so pressing it always gives feedback.
 */
export function useAboutValidation(draft: TargetsDraft) {
  // The draft as of the last submit or blur; errors are derived from it, not from every keystroke.
  const [snapshot, setSnapshot] = useState<TargetsDraft | null>(null);
  const [forced, setForced] = useState<AboutErrors | null>(null);
  const [focus, setFocus] = useState<{ field: AboutField; n: number } | null>(null);

  // A unit switch changes the accepted ranges, so it refreshes the shown errors immediately.
  const basis = snapshot && snapshot.units !== draft.units ? draft : snapshot;
  let errors: AboutErrors = {};
  if (basis) {
    const r = validateAbout(basis);
    errors = r.ok ? {} : r.errors;
  }
  if (forced) errors = { ...errors, ...forced };

  return {
    errors,
    focus,
    onBlur: () => {
      if (snapshot) {
        setSnapshot(draft);
        setForced(null);
      }
    },
    /** Validates now; shows the errors and moves focus to the first invalid field. */
    submit(): AboutResult {
      const result = validateAbout(draft);
      setSnapshot(draft);
      setForced(null);
      if (!result.ok && result.first && !result.underage) {
        setFocus({ field: result.first, n: (focus?.n ?? 0) + 1 });
      }
      return result;
    },
    /** Shows a specific error (for example the under-16 message inside a sheet). */
    showErrors(next: AboutErrors) {
      setSnapshot(draft);
      setForced(next);
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
    // Only a new submit (a new focus request) moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

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
        onChangeText={(t) =>
          dispatch({ type: 'setField', field: 'birthYear', value: t.replace(/\D/g, '') })
        }
        keyboardType="number-pad"
        maxLength={4}
        placeholder={ph.birthYear}
        returnKeyType="next"
        onSubmitEditing={() => (imperial ? heightFt : heightCm).current?.focus()}
        autoFocus={autoFocusYear}
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
              onSubmitEditing={() => heightIn.current?.focus()}
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
              onSubmitEditing={() => weight.current?.focus()}
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
          onChangeText={(t) =>
            dispatch({ type: 'setField', field: 'heightCm', value: t.replace(/[^\d.,]/g, '') })
          }
          keyboardType="number-pad"
          maxLength={5}
          placeholder={ph.heightCm}
          returnKeyType="next"
          onSubmitEditing={() => weight.current?.focus()}
          error={errors.height}
          {...common}
        />
      )}
      <TextField
        ref={weight}
        label={imperial ? L.weightLb : L.weightKg}
        value={draft.weight}
        onChangeText={(t) =>
          dispatch({ type: 'setField', field: 'weight', value: t.replace(/[^\d.,]/g, '') })
        }
        keyboardType="decimal-pad"
        maxLength={6}
        placeholder={imperial ? ph.weightLb : ph.weightKg}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        helper={copy.weightHelper}
        error={errors.weight}
        {...common}
      />
    </View>
  );
}
