import { useCallback, useEffect, useMemo } from 'react';
import { useProfile } from '@/features/profile/api';
import { useAuth } from '@/lib/auth';
import { gateCache } from '@/lib/gateCache';
import { useResetUnderage } from './api';

export type GateStatus = 'checking' | 'error' | 'needs_onboarding' | 'complete';

/** Users whose pending under-16 reset was already retried in this app session (a simple backoff: once per start). */
const resetRetried = new Set<string>();
/** Test helper: forgets the retries of the session. */
export function resetUnderageRetryMemory(): void {
  resetRetried.clear();
}

/**
 * Decides where the signed-in area goes (spec 001 T4, "Gate"). The device cache is read synchronously on the
 * first render, so a completed user opens to Today even offline; once the server answers it always wins.
 * An error never defaults to onboarding or Today: the user sees a retry screen instead.
 */
export function useOnboardingGate(): { status: GateStatus; retry: () => void } {
  const uid = useAuth().session?.user.id;
  const profile = useProfile();
  const cached = useMemo(() => (uid ? gateCache.read(uid) : null), [uid]);
  const resetUnderage = useResetUnderage();

  const serverCompleted = profile.data ? profile.data.onboarding_completed_at !== null : null;

  useEffect(() => {
    if (uid && serverCompleted !== null)
      gateCache.update(uid, { onboardingCompleted: serverCompleted });
  }, [uid, serverCompleted]);

  // A failed under-16 reset is retried once the profile is known, at most once per app session: if it fails again
  // the flag stays set and the next app start tries again, instead of hitting the server on every gate mount.
  const hasProfile = !!profile.data;
  useEffect(() => {
    if (!uid || !hasProfile || resetRetried.has(uid)) return;
    if (gateCache.hasPendingUnderageReset(uid)) {
      resetRetried.add(uid);
      void resetUnderage();
    }
  }, [uid, hasProfile, resetUnderage]);

  const refetch = profile.refetch;
  const retry = useCallback(() => void refetch(), [refetch]);

  let status: GateStatus = 'checking';
  if (serverCompleted !== null) status = serverCompleted ? 'complete' : 'needs_onboarding';
  else if (cached?.onboardingCompleted) status = 'complete';
  else if (profile.isError) status = 'error';
  return { status, retry };
}
