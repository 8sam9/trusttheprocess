import { act, screen, waitFor } from 'expo-router/testing-library';
import { authStorage } from '@/lib/authStorage';
import { gateCache } from '@/lib/gateCache';
import { backend, makeProfile, makeTargets, rpc } from '@/test/backend';
import { renderApp, setupUser } from '@/test/render';
import { press } from '@/test/flows';

jest.mock('@/lib/supabase', () => ({ supabase: require('@/test/backend').supabase }));
jest.mock('@/lib/auth', () => require('@/test/backend').authModule);

const completed = makeProfile({
  onboarding_completed_at: '2026-10-19T08:00:00+00:00',
  health_data_consent_at: '2026-10-19T08:00:00+00:00',
  sex: 'female',
  birth_year: 1996,
  height_cm: 165,
  weight_kg: 65,
  activity_level: 'light',
  goal: 'lose',
  goal_option: 'lose_fat',
  weekly_rate_kg: 0.5,
});
const summary = {
  effective_from: '2026-10-19',
  kcal: 1330,
  protein_g: 104,
  carbs_g: 129,
  fat_g: 44,
  is_custom: false,
  floor_applied: false,
};

beforeEach(() => {
  backend.reset();
  authStorage?.clear();
});

describe('S0: the gate never shows the wrong screen', () => {
  it('shows only a loading state until the status is known', async () => {
    let release: () => void = () => {};
    backend.profileGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    backend.profile = makeProfile();
    // Not awaiting the settle step of renderApp: the gate is still loading.
    const pending = renderApp('/');
    await waitFor(() => expect(screen.getByLabelText('Loading your plan')).toBeOnTheScreen());
    expect(screen.queryByText('YOUR DATA, YOUR CALL')).toBeNull();
    expect(screen.queryByText("TODAY'S TARGET")).toBeNull();
    await act(async () => release());
    await pending;
    await waitFor(() => expect(screen.getByText('YOUR DATA, YOUR CALL')).toBeOnTheScreen());
  });

  it('on a fetch error with no cache shows a retry screen, never onboarding or Today', async () => {
    backend.profileError = 'TypeError: Failed to fetch';
    const user = setupUser();
    await renderApp('/');
    await waitFor(() =>
      expect(
        screen.getByText("We couldn't load your profile. Check your connection and try again."),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByText('YOUR DATA, YOUR CALL')).toBeNull();
    expect(screen.queryByText("TODAY'S TARGET")).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
    // The network returns: TRY AGAIN resolves into the right screen.
    backend.profileError = null;
    backend.profile = makeProfile();
    await press(user, 'TRY AGAIN');
    await waitFor(() => expect(screen.getByText('YOUR DATA, YOUR CALL')).toBeOnTheScreen());
  });

  it('does not treat a corrupt or foreign cache as "completed"', async () => {
    backend.profileError = 'TypeError: Failed to fetch';
    authStorage?.setItem('ttp:v1:gate:u1', '{broken');
    gateCache.update('someone-else', { onboardingCompleted: true });
    await renderApp('/');
    await waitFor(() =>
      expect(screen.getByText(/We couldn't load your profile/)).toBeOnTheScreen(),
    );
    expect(screen.queryByText("TODAY'S TARGET")).toBeNull();
  });
});

describe('completed users (AC 2, 27)', () => {
  it('lands on Today when the server says completed, and caches only flags and a targets summary', async () => {
    backend.profile = completed;
    backend.targets = [makeTargets()];
    const view = await renderApp('/');
    await waitFor(() => expect(screen.getByText("TODAY'S TARGET")).toBeOnTheScreen());
    expect(view.getPathname()).toBe('/');
    await waitFor(() => expect(gateCache.read('u1')?.targets).toEqual(summary));
    expect(gateCache.read('u1')).toMatchObject({ onboardingCompleted: true });
    expect(authStorage?.getItem('ttp:v1:gate:u1')).not.toMatch(/height|weight|birth|sex/);
  });

  it('opens to Today offline from the device cache (cold start, AC 2)', async () => {
    gateCache.update('u1', { onboardingCompleted: true, targets: summary });
    backend.profileError = 'TypeError: Failed to fetch';
    backend.targetsError = 'TypeError: Failed to fetch';
    const view = await renderApp('/');
    await waitFor(() => expect(screen.getByText("TODAY'S TARGET")).toBeOnTheScreen());
    expect(screen.getAllByText('1,330').length).toBeGreaterThan(0);
    expect(screen.queryByText(/We couldn't load your profile/)).toBeNull();
    expect(view.getPathname()).toBe('/');
  });

  it('switches to onboarding if the server disagrees with a stale cache (the server always wins)', async () => {
    gateCache.update('u1', { onboardingCompleted: true, targets: summary });
    backend.profile = makeProfile(); // not completed on the server (reset, or another device)
    await renderApp('/');
    await waitFor(() => expect(screen.getByText('YOUR DATA, YOUR CALL')).toBeOnTheScreen());
    expect(gateCache.read('u1')?.onboardingCompleted).toBe(false);
  });

  it('shows the stored server row on a new device without computing anything (AC 27)', async () => {
    backend.profile = completed;
    // Deliberately not what the formula would give for this profile.
    backend.targets = [
      makeTargets({ kcal: 1777, protein_g: 111, carbs_g: 222, fat_g: 33, calculated_kcal: 1777 }),
    ];
    await renderApp('/');
    await waitFor(() => expect(screen.getAllByText('1,777').length).toBeGreaterThan(0));
    expect(screen.getByLabelText('Protein, 111 grams')).toBeOnTheScreen();
    expect(screen.getByLabelText('Carbs, 222 grams')).toBeOnTheScreen();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never changes stored targets with the passing of time (AC 23)', async () => {
    backend.profile = completed;
    backend.targets = [makeTargets()];
    await renderApp('/');
    await waitFor(() => expect(screen.getByText("TODAY'S TARGET")).toBeOnTheScreen());
    // A year later: the user is a year older, so a recomputation would differ. The row is still in effect.
    await act(async () => {
      jest.setSystemTime(new Date('2027-10-20T10:00:00Z'));
    });
    const view = await renderApp('/');
    await waitFor(() => expect(screen.getByText("TODAY'S TARGET")).toBeOnTheScreen());
    expect(screen.getAllByText('1,330').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Protein, 104 grams')).toBeOnTheScreen();
    expect(view.getPathname()).toBe('/');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('shows Today with the target of the right day when several rows exist', async () => {
    backend.profile = completed;
    backend.targets = [
      makeTargets({ effective_from: '2099-01-01', kcal: 1111 }),
      makeTargets({ effective_from: '2026-10-19', kcal: 1330 }),
      makeTargets({ effective_from: '2026-09-01', kcal: 1500 }),
    ];
    await renderApp('/');
    await waitFor(() => expect(screen.getByText("TODAY'S TARGET")).toBeOnTheScreen());
    expect(screen.getAllByText('1,330').length).toBeGreaterThan(0);
    expect(screen.queryByText('1,111')).toBeNull();
  });
});

describe('Today (S8)', () => {
  it('replaces the placeholder with the target card and an empty lane bar', async () => {
    backend.profile = { ...completed, display_name: 'Sam' };
    backend.targets = [makeTargets()];
    await renderApp('/');
    await waitFor(() => expect(screen.getByText("TODAY'S TARGET")).toBeOnTheScreen());
    expect(screen.getByText('Hi Sam')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: '0 of 1,330 kcal logged' })).toBeOnTheScreen();
    expect(screen.getByText('Your plan is set. Food logging lands here next.')).toBeOnTheScreen();
    expect(screen.queryByText(/Coming in Milestone 1/)).toBeNull();
    expect(screen.queryByText(/Plan saved/)).toBeNull(); // only right after onboarding
    expect(screen.getByRole('button', { name: 'Profile & settings' })).toBeOnTheScreen();
  });
});
