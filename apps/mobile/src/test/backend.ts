/**
 * In-memory stand-in for the Supabase client, used by screen and routing tests. It models only what the app calls:
 * profiles select/update, daily_targets select, and the RPCs. Wire it up in a test file with:
 *
 *   jest.mock('@/lib/supabase', () => ({ supabase: require('@/test/backend').supabase }));
 *   jest.mock('@/lib/auth', () => require('@/test/backend').authModule);
 */
import type { ApplyTargetsArgs, DailyTargetsRow, ProfileRow } from '@ttp/shared';

export const USER_ID = 'u1';

export function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    user_id: USER_ID,
    display_name: null,
    sex: null,
    birth_year: null,
    height_cm: null,
    activity_level: null,
    goal: null,
    goal_option: null,
    weekly_rate_kg: null,
    weight_kg: null,
    weight_recorded_on: null,
    units: 'metric',
    timezone: 'Europe/Rome',
    health_data_consent_at: null,
    onboarding_completed_at: null,
    created_at: '2026-10-19T08:00:00+00:00',
    updated_at: '2026-10-19T08:00:00+00:00',
    ...overrides,
  };
}

export function makeTargets(overrides: Partial<DailyTargetsRow> = {}): DailyTargetsRow {
  return {
    user_id: USER_ID,
    effective_from: '2026-10-19',
    kcal: 1330,
    protein_g: 104,
    carbs_g: 129,
    fat_g: 44,
    calculated_kcal: 1330,
    is_custom: false,
    floor_applied: false,
    bmr: 1370,
    maintenance_kcal: 1884,
    goal: 'lose',
    goal_option: 'lose_fat',
    weekly_rate_kg: 0.5,
    activity_level: 'light',
    formula_version: 'msj-1',
    created_at: '2026-10-19T08:00:00+00:00',
    updated_at: '2026-10-19T08:00:00+00:00',
    ...overrides,
  };
}

type Result<T> = { data: T | null; error: { code: string; message: string } | null };

export const backend = {
  profile: makeProfile() as ProfileRow,
  /** When set, selecting the profile fails with this message (code '' like a supabase-js network error). */
  profileError: null as string | null,
  /** When set, selecting the profile waits for this promise (to test the loading state). */
  profileGate: null as Promise<void> | null,
  targets: [] as DailyTargetsRow[],
  targetsError: null as string | null,
  /** Responses for rpc(name, args); defaults to a successful apply_targets built from the arguments. */
  rpcResults: {} as Record<
    string,
    (args: Record<string, unknown>) => Result<unknown> | Promise<Result<unknown>>
  >,
  deleteResult: { error: null } as { error: unknown },
  reset() {
    this.profile = makeProfile();
    this.profileError = null;
    this.profileGate = null;
    this.targets = [];
    this.targetsError = null;
    this.rpcResults = {};
    this.deleteResult = { error: null };
    rpc.mockClear();
    from.mockClear();
    invoke.mockClear();
  },
};

const failure = (message: string): Result<never> => ({
  data: null,
  error: { code: '', message },
});

/** What the real RPC returns: the updated profile and the targets row in effect. */
function defaultApplyTargets(args: Record<string, unknown>): Result<unknown> {
  const a = args as unknown as ApplyTargetsArgs;
  const now = '2026-10-20T09:00:00+00:00';
  const profile: ProfileRow = {
    ...backend.profile,
    sex: a.p_sex,
    birth_year: a.p_birth_year,
    height_cm: a.p_height_cm,
    weight_kg: a.p_weight_kg,
    activity_level: a.p_activity_level,
    goal_option: a.p_goal_option,
    goal: (
      {
        lose_fat: 'lose',
        build_muscle: 'gain',
        fuel_performance: 'maintain',
        just_track: 'maintain',
      } as const
    )[a.p_goal_option],
    weekly_rate_kg: a.p_weekly_rate_kg,
    units: a.p_units,
    timezone: a.p_timezone,
    health_data_consent_at: backend.profile.health_data_consent_at ?? now,
    onboarding_completed_at: backend.profile.onboarding_completed_at ?? now,
  };
  const targets = makeTargets({
    effective_from: '2026-10-20',
    kcal: a.p_kcal,
    protein_g: a.p_protein_g,
    carbs_g: a.p_carbs_g,
    fat_g: a.p_fat_g,
    calculated_kcal: a.p_calculated_kcal,
    is_custom: a.p_kcal !== a.p_calculated_kcal,
    floor_applied: a.p_floor_applied,
    bmr: a.p_bmr,
    maintenance_kcal: a.p_maintenance_kcal,
    goal: profile.goal ?? 'maintain',
    goal_option: a.p_goal_option,
    weekly_rate_kg: a.p_weekly_rate_kg,
    activity_level: a.p_activity_level,
  });
  backend.profile = profile;
  backend.targets = [
    targets,
    ...backend.targets.filter((t) => t.effective_from < targets.effective_from),
  ];
  return { data: { profile, targets }, error: null };
}

export const rpc = jest.fn(
  async (name: string, args?: Record<string, unknown>): Promise<Result<unknown>> => {
    const custom = backend.rpcResults[name];
    if (custom) return custom(args ?? {});
    if (name === 'apply_targets') return defaultApplyTargets(args ?? {});
    if (name === 'reset_onboarding_for_underage') {
      backend.profile = makeProfile({
        ...backend.profile,
        health_data_consent_at: null,
        sex: null,
        birth_year: null,
        height_cm: null,
        weight_kg: null,
      });
      return { data: null, error: null };
    }
    if (name === 'give_health_data_consent' || name === 'withdraw_health_data_consent') {
      backend.profile = {
        ...backend.profile,
        health_data_consent_at:
          name === 'give_health_data_consent' ? '2026-10-20T09:00:00+00:00' : null,
      };
      return { data: null, error: null };
    }
    return failure(`unexpected rpc ${name}`);
  },
);

export const from = jest.fn((table: string) => {
  if (table === 'profiles') {
    return {
      select: () => ({
        single: async (): Promise<Result<ProfileRow>> => {
          if (backend.profileGate) await backend.profileGate;
          return backend.profileError
            ? failure(backend.profileError)
            : { data: backend.profile, error: null };
        },
      }),
      update: (changes: Partial<ProfileRow>) => ({
        eq: () => ({
          select: () => ({
            single: async (): Promise<Result<ProfileRow>> => {
              backend.profile = { ...backend.profile, ...changes };
              return { data: backend.profile, error: null };
            },
          }),
        }),
      }),
    };
  }
  if (table === 'daily_targets') {
    return {
      select: () => ({
        order: () => ({
          limit: async (): Promise<Result<DailyTargetsRow[]>> =>
            backend.targetsError
              ? failure(backend.targetsError)
              : { data: backend.targets, error: null },
        }),
      }),
    };
  }
  throw new Error(`unexpected table ${table}`);
});

export const invoke = jest.fn(async () => backend.deleteResult);
const signOut = jest.fn(async () => ({ error: null }));

export const supabase = {
  from,
  rpc,
  functions: { invoke },
  auth: { signOut, getSession: jest.fn(), onAuthStateChange: jest.fn() },
};

export const session = { user: { id: USER_ID, email: 'sam@example.com' } };
export const authModule = {
  useAuth: () => ({ session, loading: false }),
  AuthProvider: ({ children }: { children: unknown }) => children,
};
