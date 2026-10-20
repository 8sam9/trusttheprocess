import type { ProfileRow } from '@ttp/shared';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react';
import { useProfile } from '@/features/profile/api';
import { track } from '@/lib/analytics';
import { deviceRegion } from '@/lib/locale';
import { draftFromProfile, draftReducer, type DraftAction, type TargetsDraft } from './draft';

export type OnboardingPhase = 'consent' | 'underage' | 'steps';

interface OnboardingState {
  draft: TargetsDraft;
  dispatch: Dispatch<DraftAction>;
  profile: ProfileRow;
  /** True when the server already holds the user's consent (then the Consent screen is skipped). */
  serverConsent: boolean;
  phase: OnboardingPhase;
}

const OnboardingContext = createContext<OnboardingState | null>(null);

/**
 * Holds the onboarding answers in memory only (spec OQ 6): they are lost on a kill, a refresh or a sign-out,
 * because the signed-in tree unmounts. Mounted by the onboarding layout, which the gate only renders once the
 * profile is known.
 */
export function OnboardingProvider({
  profile,
  children,
}: {
  profile: ProfileRow;
  children: ReactNode;
}) {
  const [draft, dispatch] = useReducer(draftReducer, profile, (row) =>
    draftFromProfile(row, null, deviceRegion()),
  );
  const live = useProfile().data ?? profile;
  const serverConsent = live.health_data_consent_at !== null;
  const phase: OnboardingPhase = draft.underage
    ? 'underage'
    : serverConsent || draft.consentGiven
      ? 'steps'
      : 'consent';

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track({ name: 'onboarding_started', entry: draft.prefilled ? 'resumed' : 'first_run' });
  }, [draft.prefilled]);

  const value = useMemo(
    () => ({ draft, dispatch, profile: live, serverConsent, phase }),
    [draft, live, serverConsent, phase],
  );
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingState {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
