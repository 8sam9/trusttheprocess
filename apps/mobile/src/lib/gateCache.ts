import { CachedGate } from '@ttp/shared';
import { authStorage } from './authStorage';

/**
 * Per-user device cache for the onboarding gate (spec 001 T1 #6). It lives in the synchronous localStorage
 * (expo-sqlite's polyfill on native, the browser's on web) so the first render already knows where to go,
 * and a completed user opens to Today offline.
 *
 * PRIVACY: exactly these fields are cached per user, nothing else:
 *   - `ttp:v1:gate:<uid>`: `v`, `onboardingCompleted` (boolean), `cachedAt` (ISO time) and an optional targets
 *     summary: `effective_from`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `is_custom`, `floor_applied`.
 *     The kcal and macro numbers are health-derived, so they are removed on sign-out and account deletion.
 *   - `ttp:v1:underage-reset:<uid>`: the flag '1' (no data).
 * Never body stats (birth year, sex, height, weight), never goal, activity or pace.
 * `clear(uid)` removes both keys and is called on sign-out (lib/auth.tsx) and account deletion (profile/api.ts).
 */
const gateKey = (uid: string) => `ttp:v1:gate:${uid}`;
const underageKey = (uid: string) => `ttp:v1:underage-reset:${uid}`;

export type TargetsSummary = NonNullable<CachedGate['targets']>;

function storage(): Storage | undefined {
  return authStorage;
}

export const gateCache = {
  read(uid: string): CachedGate | null {
    try {
      const raw = storage()?.getItem(gateKey(uid));
      if (!raw) return null;
      const parsed = CachedGate.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },

  /** Merges a patch into the cached value (a missing or corrupt value starts from "not completed"). */
  update(
    uid: string,
    patch: { onboardingCompleted?: boolean; targets?: TargetsSummary | null },
    now: Date = new Date(),
  ): void {
    try {
      const current = gateCache.read(uid);
      const next: CachedGate = {
        v: 1,
        onboardingCompleted: patch.onboardingCompleted ?? current?.onboardingCompleted ?? false,
        targets: patch.targets !== undefined ? patch.targets : (current?.targets ?? null),
        cachedAt: now.toISOString(),
      };
      storage()?.setItem(gateKey(uid), JSON.stringify(next));
    } catch {
      // A full or unavailable storage only costs us the offline shortcut.
    }
  },

  /** Removes everything cached for this user (the gate value and the pending under-16 reset flag). */
  clear(uid: string): void {
    try {
      storage()?.removeItem(gateKey(uid));
      storage()?.removeItem(underageKey(uid));
    } catch {
      // ignore
    }
  },

  /** An under-16 reset that failed on the network; retried at the next app start. Holds no health data. */
  setPendingUnderageReset(uid: string): void {
    try {
      storage()?.setItem(underageKey(uid), '1');
    } catch {
      // ignore
    }
  },
  hasPendingUnderageReset(uid: string): boolean {
    try {
      return storage()?.getItem(underageKey(uid)) === '1';
    } catch {
      return false;
    }
  },
  clearPendingUnderageReset(uid: string): void {
    try {
      storage()?.removeItem(underageKey(uid));
    } catch {
      // ignore
    }
  },
};
