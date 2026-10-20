import { act, screen, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { backend, from, makeProfile, makeTargets, rpc } from '@/test/backend';
import { eventsNamed } from '@/test/analyticsSpy';
import { fillAbout, goToReveal, press } from '@/test/flows';
import { mockRegionOnce } from '@/test/locale';
import { renderApp, setupUser } from '@/test/render';
import { authStorage } from '@/lib/authStorage';
import { resetUnderageRetryMemory } from './gate';

jest.mock('@/lib/supabase', () => ({ supabase: jest.requireActual('@/test/backend').supabase }));
jest.mock('@/lib/auth', () => jest.requireActual('@/test/backend').authModule);

beforeEach(() => {
  resetUnderageRetryMemory();
  backend.reset();
  authStorage?.clear();
});

const applyCalls = () => rpc.mock.calls.filter(([name]) => name === 'apply_targets');
const lastArgs = () => applyCalls().at(-1)?.[1] as Record<string, unknown>;
const waitForText = (text: string | RegExp) =>
  waitFor(() => expect(screen.getByText(text)).toBeOnTheScreen());

describe('first-run gating (AC 1, 2)', () => {
  it('shows onboarding instead of Today and cannot be bypassed', async () => {
    const view = await renderApp('/');
    await waitForText('YOUR DATA, YOUR CALL');
    expect(view.getPathname()).toBe('/onboarding/consent');
    await act(async () => router.push('/'));
    await act(async () => router.push('/settings'));
    expect(view.getPathname()).toMatch(/^\/onboarding\//);
    expect(screen.queryByText("TODAY'S TARGET")).toBeNull();
  });

  it('skips onboarding for a completed user and lands on Today', async () => {
    backend.profile = makeProfile({
      onboarding_completed_at: '2026-10-19T08:00:00+00:00',
      health_data_consent_at: '2026-10-19T08:00:00+00:00',
    });
    backend.targets = [makeTargets()];
    const view = await renderApp('/');
    await waitForText("TODAY'S TARGET");
    expect(view.getPathname()).toBe('/');
  });
});

describe('consent (AC 8, 9, 28)', () => {
  it('sends nothing before the final save, however far the user goes', async () => {
    const user = setupUser();
    await renderApp('/');
    await waitForText('YOUR DATA, YOUR CALL');
    await goToReveal(user);
    await waitForText('YOUR GAME PLAN');
    expect(rpc).not.toHaveBeenCalled();
    expect(from.mock.calls.every(([table]) => table === 'profiles')).toBe(true);
  });

  it('records consent with the save, not on the tap', async () => {
    const user = setupUser();
    await renderApp('/');
    await goToReveal(user);
    await press(user, "LET'S GO");
    await waitForText("TODAY'S TARGET");
    expect(applyCalls()).toHaveLength(1);
    expect(lastArgs()).toMatchObject({ p_give_consent: true });
  });

  it('does not ask again, or send consent, when the server already holds it', async () => {
    backend.profile = makeProfile({ health_data_consent_at: '2026-10-19T08:00:00+00:00' });
    const user = setupUser();
    await renderApp('/');
    await waitForText('ABOUT YOU');
    await goToReveal(user, { consent: false });
    await press(user, "LET'S GO");
    await waitForText("TODAY'S TARGET");
    expect(lastArgs()).toMatchObject({ p_give_consent: false });
  });

  it('declining shows reconsider, sign out and delete account, with zero network calls', async () => {
    const user = setupUser();
    await renderApp('/');
    await press(user, 'NO THANKS');
    await waitForText('YOUR CALL, RESPECTED');
    expect(screen.getByRole('button', { name: 'REVIEW CONSENT' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeOnTheScreen();
    expect(screen.getByText(/Nothing about your body has been stored\./)).toBeOnTheScreen();
    expect(rpc).not.toHaveBeenCalled();
    // Onboarding never completes from here; reconsider returns to the consent screen.
    await press(user, 'REVIEW CONSENT');
    await waitForText('YOUR DATA, YOUR CALL');
  });

  it('gives Decline the same size as Agree, as a visible button (not a faded link)', async () => {
    await renderApp('/');
    await waitForText('YOUR DATA, YOUR CALL');
    const heights = ['I AGREE', 'NO THANKS'].map((name) => {
      const style = screen.getByRole('button', { name }).props.style;
      return (typeof style === 'function' ? style({ pressed: false }) : style).minHeight;
    });
    expect(heights).toEqual([56, 56]);
  });

  it('lists what is stored, why, who sees it and how to withdraw, with a privacy link', async () => {
    await renderApp('/');
    await waitForText('YOUR DATA, YOUR CALL');
    for (const title of ['What we store', 'Why', 'Who sees it', 'Your control']) {
      expect(screen.getByLabelText(new RegExp(`^${title}\\.`))).toBeOnTheScreen();
    }
    expect(screen.getByRole('link', { name: 'Read the privacy policy' })).toBeOnTheScreen();
    expect(screen.getByText(/you're 16 or older/)).toBeOnTheScreen();
  });
});

describe('About you (AC 3, 12, 13, 14, 15)', () => {
  it('prefills a partial profile and says so (AC 3)', async () => {
    backend.profile = makeProfile({
      health_data_consent_at: '2026-10-19T08:00:00+00:00',
      sex: 'male',
      birth_year: 1989,
      height_cm: 180,
      activity_level: 'moderate',
    });
    await renderApp('/');
    await waitForText('ABOUT YOU');
    expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked();
    expect(screen.getByLabelText('Year of birth')).toHaveDisplayValue('1989');
    expect(screen.getByLabelText('Height (cm)')).toHaveDisplayValue('180');
    expect(screen.getByText(/We've filled in what you gave us before/)).toBeOnTheScreen();
    expect(eventsNamed('onboarding_started')).toEqual([
      { name: 'onboarding_started', entry: 'resumed' },
    ]);
  });

  it('shows inline range errors in the user units and blocks CONTINUE (AC 13)', async () => {
    const user = setupUser();
    await renderApp('/');
    await press(user, 'I AGREE');
    await fillAbout(user, { year: '1900', height: '99', weight: '29' });
    await press(user, 'CONTINUE');
    expect(screen.getByText('That year looks off. Try 1916 or later.')).toBeOnTheScreen();
    expect(
      screen.getByText('That height looks off. Try between 100 and 250 cm.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('That weight looks off. Try between 30 and 350 kg.')).toBeOnTheScreen();
    expect(screen.getByText('STEP 1 OF 5')).toBeOnTheScreen();
    expect(screen.getByLabelText('Year of birth').props.accessibilityHint).toBe(
      'That year looks off. Try 1916 or later.',
    );
  });

  it('asks for missing answers without disabling CONTINUE', async () => {
    const user = setupUser();
    await renderApp('/');
    await press(user, 'I AGREE');
    const button = screen.getByRole('button', { name: 'CONTINUE' });
    expect(button).toBeEnabled();
    await user.press(button);
    for (const message of [
      'Choose one to continue. Prefer not to say is fine.',
      'Add your year of birth.',
      'Add your height.',
      'Add your weight.',
    ]) {
      expect(screen.getByText(message)).toBeOnTheScreen();
    }
  });

  it('stops an under-16 user, stores nothing and offers the way back (AC 12)', async () => {
    const user = setupUser();
    await renderApp('/');
    await press(user, 'I AGREE');
    await fillAbout(user, { year: '2015' });
    await press(user, 'CONTINUE');
    await waitForText('SEE YOU AT 16');
    expect(screen.getByText(/We haven't saved your year of birth/)).toBeOnTheScreen();
    expect(applyCalls()).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled(); // nothing was held on the server, so no reset either
    expect(eventsNamed('onboarding_blocked')).toEqual([
      { name: 'onboarding_blocked', reason: 'under_min_age' },
    ]);
    // "I typed the wrong year" goes back through consent, with the year emptied.
    await press(user, 'I typed the wrong year');
    await waitForText('YOUR DATA, YOUR CALL');
    await press(user, 'I AGREE');
    expect(screen.getByLabelText('Year of birth')).toHaveDisplayValue('');
  });

  it('resets what the server already holds when an under-16 user is blocked', async () => {
    backend.profile = makeProfile({
      health_data_consent_at: '2026-10-19T08:00:00+00:00',
      birth_year: 1989,
      sex: 'male',
    });
    const user = setupUser();
    await renderApp('/');
    await waitForText('ABOUT YOU');
    await user.clear(screen.getByLabelText('Year of birth'));
    await user.type(screen.getByLabelText('Year of birth'), '2015');
    await press(user, 'CONTINUE');
    await waitForText('SEE YOU AT 16');
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('reset_onboarding_for_underage'));
    expect(applyCalls()).toHaveLength(0);
  });

  it('keeps a pending reset on the device when the call fails, and retries at the next start', async () => {
    backend.profile = makeProfile({
      health_data_consent_at: '2026-10-19T08:00:00+00:00',
      birth_year: 1989,
    });
    backend.rpcResults.reset_onboarding_for_underage = () => ({
      data: null,
      error: { code: '', message: 'TypeError: Failed to fetch' },
    });
    const user = setupUser();
    await renderApp('/');
    await waitForText('ABOUT YOU');
    await user.clear(screen.getByLabelText('Year of birth'));
    await user.type(screen.getByLabelText('Year of birth'), '2015');
    await press(user, 'CONTINUE');
    await waitForText('SEE YOU AT 16');
    await waitFor(() => expect(authStorage?.getItem('ttp:v1:underage-reset:u1')).toBe('1'));
    // Next start: the network is back.
    delete backend.rpcResults.reset_onboarding_for_underage;
    rpc.mockClear();
    await renderApp('/');
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('reset_onboarding_for_underage'));
    await waitFor(() => expect(authStorage?.getItem('ttp:v1:underage-reset:u1')).toBeNull());
  });

  it('retries a failed pending reset at most once per app session', async () => {
    authStorage?.setItem('ttp:v1:underage-reset:u1', '1');
    backend.profile = makeProfile({ birth_year: 2015 });
    backend.rpcResults.reset_onboarding_for_underage = () => ({
      data: null,
      error: { code: '', message: 'TypeError: Failed to fetch' },
    });
    const resets = () => rpc.mock.calls.filter(([n]) => n === 'reset_onboarding_for_underage');
    await renderApp('/');
    await waitFor(() => expect(resets()).toHaveLength(1));
    await renderApp('/');
    await waitForText('YOUR DATA, YOUR CALL');
    expect(resets()).toHaveLength(1);
    expect(authStorage?.getItem('ttp:v1:underage-reset:u1')).toBe('1');
  });

  it('defaults units from the device region and converts what is typed when switching (AC 14, 15)', async () => {
    mockRegionOnce('US');
    const user = setupUser();
    await renderApp('/');
    await press(user, 'I AGREE');
    expect(screen.getByRole('radio', { name: 'Imperial (lb, ft)' })).toBeChecked();
    expect(screen.getByLabelText('Height (ft)')).toBeOnTheScreen();
    expect(screen.getByLabelText('Current weight (lb)')).toBeOnTheScreen();
    await press(user, 'Metric (kg, cm)', 'radio');
    expect(screen.getByLabelText('Height (cm)')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Height (cm)'), '165');
    await user.type(screen.getByLabelText('Current weight (kg)'), '65');
    await press(user, 'Imperial (lb, ft)', 'radio');
    expect(screen.getByLabelText('Height (ft)')).toHaveDisplayValue('5');
    expect(screen.getByLabelText('Height (in)')).toHaveDisplayValue('5');
    expect(screen.getByLabelText('Current weight (lb)')).toHaveDisplayValue('143.3');
  });

  it('metric is the default elsewhere', async () => {
    await renderApp('/');
    await press(setupUser(), 'I AGREE');
    expect(screen.getByRole('radio', { name: 'Metric (kg, cm)' })).toBeChecked();
  });

  it('converts imperial entry to metric for the save, and shows imperial everywhere after (AC 14)', async () => {
    mockRegionOnce('US');
    const user = setupUser();
    await renderApp('/');
    await press(user, 'I AGREE');
    await fillAbout(user, { feet: '5', inches: '5', weight: '143' });
    await press(user, 'CONTINUE');
    await press(user, /^Lose fat\./, 'radio');
    await press(user, 'CONTINUE');
    await press(user, /^Lightly active/, 'radio');
    await press(user, 'CONTINUE');
    // Pace is shown in lb, and the default is the moderate preset (1 lb).
    expect(screen.getByText('1 lb a week')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Moderate/ })).toBeChecked();
    await press(user, 'CONTINUE');
    await waitForText('YOUR GAME PLAN');
    expect(screen.getByText('LOSE FAT · MODERATE · 1 LB A WEEK')).toBeOnTheScreen();
    await press(user, "LET'S GO");
    await waitForText("TODAY'S TARGET");
    expect(lastArgs()).toMatchObject({
      p_height_cm: 165.1,
      p_weight_kg: 64.86,
      p_weekly_rate_kg: 0.45,
      p_units: 'imperial',
    });
  });
});
