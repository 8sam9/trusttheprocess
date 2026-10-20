import { CachedGate } from '@ttp/shared';
import { authStorage } from './authStorage';

/**
 * Per-user device cache for the onboarding gate (spec 001 T1 #6). It lives in the synchronous localStorage
 * (expo-sqlite's polyfill on native, the browser's on web) so the first render already knows where to go,
 * and a completed user opens to Today offline. It holds a flag and a coarse targets summary, never body stats.
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

  clear(uid: string): void {
    try {
      storage()?.removeItem(gateKey(uid));
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
