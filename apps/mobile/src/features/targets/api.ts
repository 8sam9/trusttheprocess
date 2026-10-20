import {
  ApplyTargetsArgs,
  ApplyTargetsErrorCode,
  ApplyTargetsResult,
  DailyTargetsRow,
  localDateIn,
  targetForDate,
} from '@ttp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { profileKey, useProfile } from '@/features/profile/api';
import { useAuth } from '@/lib/auth';
import { gateCache, type TargetsSummary } from '@/lib/gateCache';
import { deviceTimeZone } from '@/lib/locale';
import { supabase } from '@/lib/supabase';

export const targetsKey = (uid: string | undefined) => ['targets', uid] as const;

export type SaveFailure = 'offline' | 'server' | 'validation';

/** Thrown before a request when the arguments fail the shared rules; carries the RPC error code. */
export class ApplyValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ApplyValidationError';
  }
}

/**
 * Maps an error from apply_targets to the three user-facing failure kinds (AC 29).
 * PostgREST errors have a SQLSTATE `code`; a network failure has an empty code and a fetch-style message.
 */
export function toSaveFailure(error: unknown): SaveFailure {
  if (error instanceof ApplyValidationError) return 'validation';
  const e = (typeof error === 'object' && error !== null ? error : {}) as {
    code?: unknown;
    message?: unknown;
  };
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  if (code === 'P0001') {
    const known = ApplyTargetsErrorCode.safeParse(message);
    return known.success && known.data !== 'not_authenticated' ? 'validation' : 'server';
  }
  if (code === '23514' || code === '22P02') return 'validation';
  if (
    code === '' &&
    /failed to fetch|network request failed|networkerror|load failed|network error|internet connection appears to be offline|timed out/i.test(
      message,
    )
  ) {
    return 'offline';
  }
  return 'server';
}

export function toSummary(row: DailyTargetsRow): TargetsSummary {
  return {
    effective_from: row.effective_from,
    kcal: row.kcal,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    is_custom: row.is_custom,
    floor_applied: row.floor_applied,
  };
}

export interface CurrentTargets {
  /** The full row in effect today (null while loading, offline without a cache, or none exists). */
  row: DailyTargetsRow | null;
  /** The coarse numbers; falls back to the device cache so Today renders offline. */
  summary: TargetsSummary | null;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

/** The targets in effect on the user's current local date (stored values, never recomputed: AC 23, 27). */
export function useCurrentTargets(): CurrentTargets {
  const uid = useAuth().session?.user.id;
  const profile = useProfile();
  const rows = useQuery({
    queryKey: targetsKey(uid),
    enabled: !!uid,
    retry: 1,
    queryFn: async (): Promise<DailyTargetsRow[]> => {
      const { data, error } = await supabase
        .from('daily_targets')
        .select('*')
        .order('effective_from', { ascending: false })
        .limit(5);
      if (error) throw error;
      return DailyTargetsRow.array().parse(data ?? []);
    },
  });

  const timeZone = profile.data?.timezone ?? deviceTimeZone();
  const row = rows.data ? targetForDate(rows.data, localDateIn(timeZone)) : null;
  const cached = useMemo(() => (uid ? gateCache.read(uid) : null), [uid]);
  const summary = row ? toSummary(row) : rows.data ? null : (cached?.targets ?? null);

  const summaryKey = row ? JSON.stringify(toSummary(row)) : '';
  useEffect(() => {
    if (uid && row) gateCache.update(uid, { targets: toSummary(row) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialised summary
  }, [uid, summaryKey]);

  return {
    row,
    summary,
    isPending: rows.isPending && !summary,
    isError: rows.isError && !summary,
    refetch: () => void rows.refetch(),
  };
}

/** Saves goal, stats, targets and completion in one RPC (AC 11). Callers handle failures with toSaveFailure. */
export function useApplyTargets() {
  const qc = useQueryClient();
  const uid = useAuth().session?.user.id;
  return useMutation({
    retry: 0,
    mutationFn: async (args: ApplyTargetsArgs): Promise<ApplyTargetsResult | null> => {
      const parsed = ApplyTargetsArgs.safeParse(args);
      if (!parsed.success) {
        throw new ApplyValidationError(parsed.error.issues[0]?.message ?? 'invalid_input');
      }
      const { data, error } = await supabase.rpc('apply_targets', parsed.data);
      if (error) throw error;
      // The save succeeded. If the response shape is unexpected we refetch instead of reporting a failure.
      const result = ApplyTargetsResult.safeParse(data);
      return result.success ? result.data : null;
    },
    onSuccess: (result) => {
      if (!result) {
        void qc.invalidateQueries({ queryKey: profileKey(uid) });
        void qc.invalidateQueries({ queryKey: targetsKey(uid) });
        return;
      }
      qc.setQueryData(profileKey(uid), result.profile);
      qc.setQueryData(targetsKey(uid), (old: DailyTargetsRow[] | undefined) => [
        result.targets,
        ...(old ?? []).filter((r) => r.effective_from < result.targets.effective_from),
      ]);
      if (uid) {
        gateCache.update(uid, {
          onboardingCompleted: result.profile.onboarding_completed_at !== null,
          targets: toSummary(result.targets),
        });
      }
    },
  });
}

/**
 * Under-16 reset (T1 #5): withdraws consent and clears stored body stats of a user who has not finished
 * onboarding. If the call fails, a pending flag is kept on the device and retried at the next app start.
 */
export function useResetUnderage() {
  const qc = useQueryClient();
  const uid = useAuth().session?.user.id;
  return useCallback(async (): Promise<boolean> => {
    if (!uid) return false;
    try {
      const { error } = await supabase.rpc('reset_onboarding_for_underage');
      if (error) throw error;
      gateCache.clearPendingUnderageReset(uid);
      await qc.invalidateQueries({ queryKey: profileKey(uid) });
      return true;
    } catch {
      gateCache.setPendingUnderageReset(uid);
      return false;
    }
  }, [qc, uid]);
}
