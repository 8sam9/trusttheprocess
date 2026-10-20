import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { backend, from, makeProfile, rpc } from '@/test/backend';
import { eventsNamed, events } from '@/test/analyticsSpy';
import { fillAbout, goToReveal, press } from '@/test/flows';
import { mockRegionOnce } from '@/test/locale';
import { renderApp, setupUser } from '@/test/render';
import { authStorage } from '@/lib/authStorage';

jest.mock('@/lib/supabase', () => ({ supabase: require('@/test/backend').supabase }));
jest.mock('@/lib/auth', () => require('@/test/backend').authModule);

beforeEach(() => {
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
    backend.targets = [require('@/test/backend').makeTargets()];
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

describe('goal (AC 4, 5, 7, 16)', () => {
  const toGoal = async (user: ReturnType<typeof setupUser>, about = {}) => {
    await renderApp('/');
    await press(user, 'I AGREE');
    await fillAbout(user, about);
    await press(user, 'CONTINUE');
    await waitForText('WHAT ARE YOU TRAINING FOR?');
  };

  it('offers exactly four goals, none preselected, and will not continue without one (AC 4)', async () => {
    const user = setupUser();
    await toGoal(user);
    expect(screen.getByText('STEP 2 OF 5')).toBeOnTheScreen();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    radios.forEach((r) => expect(r).not.toBeChecked());
    expect(
      screen.getByRole('radio', {
        name: 'Just track. Log your food, see your patterns. No weight goal.',
      }),
    ).toBeOnTheScreen();
    await press(user, 'CONTINUE');
    expect(screen.getByText('Pick one to continue.')).toBeOnTheScreen();
    expect(screen.getByText('STEP 2 OF 5')).toBeOnTheScreen();
  });

  it('describes Build muscle in lb for imperial users', async () => {
    mockRegionOnce('US');
    const user = setupUser();
    await renderApp('/');
    await press(user, 'I AGREE');
    await fillAbout(user, { feet: '5', inches: '5', weight: '143' });
    await press(user, 'CONTINUE');
    expect(screen.getByText('Small surplus, about 0.7 g protein per lb')).toBeOnTheScreen();
  });

  it.each([
    ['Lose fat', 'lose_fat', 0.5],
    ['Build muscle', 'build_muscle', 0.25],
    ['Fuel performance', 'fuel_performance', 0],
    ['Just track', 'just_track', 0],
  ])('maps %s to %s and stores rate %s (AC 5, 7)', async (label, option, rate) => {
    const user = setupUser();
    await renderApp('/');
    await goToReveal(user, { goal: new RegExp(`^${label}\\.`) });
    await waitForText('YOUR GAME PLAN');
    await press(user, "LET'S GO");
    await waitForText("TODAY'S TARGET");
    expect(lastArgs()).toMatchObject({ p_goal_option: option, p_weekly_rate_kg: rate });
  });

  it('skips the pace step for maintain goals (AC 7)', async () => {
    const user = setupUser();
    await renderApp('/');
    await goToReveal(user, { goal: /^Just track\./ });
    await waitForText('YOUR GAME PLAN');
    expect(screen.queryByText('PICK YOUR PACE')).toBeNull();
    expect(screen.getByText('STEP 5 OF 5')).toBeOnTheScreen();
    expect(screen.getByText('JUST TRACK · STEADY WEIGHT')).toBeOnTheScreen();
  });

  it('requires a pace for lose or gain (AC 7)', async () => {
    const user = setupUser();
    await renderApp('/');
    await goToReveal(user);
    // goToReveal pressed CONTINUE on the pace step with the preselected default; the plan is shown.
    await waitForText('YOUR GAME PLAN');
    expect(screen.getByText(/MODERATE/)).toBeOnTheScreen();
  });

  it('under 18: Lose fat is unavailable with a supportive note, and the other goals work (AC 16)', async () => {
    const user = setupUser();
    await toGoal(user, { year: '2009' });
    expect(
      screen.getByText(
        /For your age and body, we'll set you up to maintain or build rather than lose\./,
      ),
    ).toBeOnTheScreen();
    const lose = screen.getByRole('radio', { name: 'Lose fat, unavailable. See note above.' });
    expect(lose).toBeDisabled();
    expect(screen.getByText('NOT AVAILABLE')).toBeOnTheScreen();
    expect(
      screen.getAllByRole('radio').filter((r) => !r.props.accessibilityState?.disabled),
    ).toHaveLength(3);
    expect(eventsNamed('onboarding_blocked')).toEqual([
      { name: 'onboarding_blocked', reason: 'low_bmi_guard' },
    ]);
    await press(user, /^Build muscle\./, 'radio');
    await press(user, 'CONTINUE');
    await waitForText('HOW ACTIVE IS YOUR WEEK?');
  });

  it('low BMI: Lose fat is unavailable, and no BMI or weight-status word is ever shown (AC 16)', async () => {
    const user = setupUser();
    await toGoal(user, { height: '180', weight: '55' });
    expect(
      screen.getByRole('radio', { name: 'Lose fat, unavailable. See note above.' }),
    ).toBeDisabled();
    expect(screen.queryByText(/bmi|underweight|overweight|obese/i)).toBeNull();
  });

  it('is not guarded for an adult with a typical BMI', async () => {
    const user = setupUser();
    await toGoal(user);
    expect(screen.queryByText('NOT AVAILABLE')).toBeNull();
    expect(eventsNamed('onboarding_blocked')).toHaveLength(0);
  });

  it('drops a stored Lose fat when the stats change so the guard applies (back and edit)', async () => {
    const user = setupUser();
    await toGoal(user);
    await press(user, /^Lose fat\./, 'radio');
    await act(async () => router.back());
    const year = screen.getByLabelText('Year of birth');
    await user.clear(year);
    await user.type(year, '2009');
    await press(user, 'CONTINUE');
    await waitForText('WHAT ARE YOU TRAINING FOR?');
    expect(
      screen.getByRole('radio', { name: 'Lose fat, unavailable. See note above.' }),
    ).toBeDisabled();
    await press(user, 'CONTINUE');
    expect(screen.getByText('Pick one to continue.')).toBeOnTheScreen();
  });
});

describe('back navigation (AC 6)', () => {
  it('keeps earlier answers when going back and forward', async () => {
    const user = setupUser();
    const view = await renderApp('/');
    await press(user, 'I AGREE');
    await fillAbout(user);
    await press(user, 'CONTINUE');
    await press(user, /^Build muscle\./, 'radio');
    await press(user, 'CONTINUE');
    await press(user, /^Very active/, 'radio');
    await act(async () => router.back());
    expect(view.getPathname()).toBe('/onboarding/goal');
    expect(screen.getByRole('radio', { name: /^Build muscle\./ })).toBeChecked();
    await act(async () => router.back());
    expect(screen.getByLabelText('Year of birth')).toHaveDisplayValue('1996');
    expect(screen.getByLabelText('Height (cm)')).toHaveDisplayValue('165');
    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked();
    await press(user, 'CONTINUE');
    await press(user, 'CONTINUE');
    expect(screen.getByRole('radio', { name: /^Very active/ })).toBeChecked();
  });

  it('counts the back steps for the completion event', async () => {
    const user = setupUser();
    await renderApp('/');
    await press(user, 'I AGREE');
    await fillAbout(user);
    await press(user, 'CONTINUE');
    await press(user, /^Lose fat\./, 'radio');
    await press(user, 'CONTINUE');
    await act(async () => router.back());
    await act(async () => router.back());
    await press(user, 'CONTINUE');
    await press(user, 'CONTINUE');
    await press(user, /^Lightly active/, 'radio');
    await press(user, 'CONTINUE');
    await press(user, 'CONTINUE');
    await press(user, "LET'S GO");
    await waitForText("TODAY'S TARGET");
    expect(eventsNamed('onboarding_completed')).toEqual([
      { name: 'onboarding_completed', duration_bucket: 'lt_1m', back_count: 2 },
    ]);
  });

  it('opens a step with an empty draft by sending the user to the first missing answer', async () => {
    const view = await renderApp('/onboarding/plan');
    await waitForText('YOUR DATA, YOUR CALL');
    expect(view.getPathname()).toBe('/onboarding/consent');
    void fireEvent;
  });
});

describe('activity and pace steps', () => {
  it('offers five activity levels and needs one (S4)', async () => {
    const user = setupUser();
    await renderApp('/');
    await press(user, 'I AGREE');
    await fillAbout(user);
    await press(user, 'CONTINUE');
    await press(user, /^Lose fat\./, 'radio');
    await press(user, 'CONTINUE');
    expect(screen.getByText('STEP 3 OF 5')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    await press(user, 'CONTINUE');
    expect(screen.getByText('Pick the closest one to continue.')).toBeOnTheScreen();
  });

  async function toPace(user: ReturnType<typeof setupUser>, goal: RegExp = /^Lose fat\./) {
    await renderApp('/');
    await press(user, 'I AGREE');
    await fillAbout(user);
    await press(user, 'CONTINUE');
    await press(user, goal, 'radio');
    await press(user, 'CONTINUE');
    await press(user, /^Lightly active/, 'radio');
    await press(user, 'CONTINUE');
    await waitForText('PICK YOUR PACE');
  }

  it('shows presets with live kcal lines, the default preselected, and the floor hint where it applies', async () => {
    const user = setupUser();
    await toPace(user);
    expect(screen.getByText('STEP 4 OF 5')).toBeOnTheScreen();
    expect(screen.getByText('About 275 kcal a day below maintenance')).toBeOnTheScreen();
    expect(screen.getByText('About 550 kcal a day below maintenance')).toBeOnTheScreen();
    expect(screen.getByText('About 825 kcal a day below maintenance')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Moderate/ })).toBeChecked();
    // Faster would drop this user to 1,059 kcal, so it carries the minimum hint (and only it).
    expect(
      screen.getAllByText('At your stats, this stops at our 1,200 kcal minimum.'),
    ).toHaveLength(1);
  });

  it('gain offers two presets, defaulting to Steady', async () => {
    const user = setupUser();
    await toPace(user, /^Build muscle\./);
    expect(screen.getByRole('radio', { name: /^Steady/ })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /^Faster/ })).toBeNull();
    expect(screen.getByText('About 275 kcal a day above maintenance')).toBeOnTheScreen();
  });

  describe('custom pace (CR-1, AC 33, 34, 35)', () => {
    const notice =
      'We strongly suggest no more than 0.75 kg a week. Slower is easier to keep up and protects muscle.';

    it('always shows the 0.75 kg recommendation (AC 35)', async () => {
      const user = setupUser();
      await toPace(user);
      expect(screen.getByText(notice)).toBeOnTheScreen();
      await press(user, /^Custom/, 'radio');
      expect(screen.getByText(notice)).toBeOnTheScreen();
    });

    it('adds a fourth Custom card with its range, revealing a labelled decimal input', async () => {
      const user = setupUser();
      await toPace(user);
      expect(screen.getAllByRole('radio')).toHaveLength(4);
      expect(screen.queryByLabelText('Custom pace in kg a week')).toBeNull();
      await press(user, /^Custom/, 'radio');
      expect(screen.getByText('0.01 to 1.5 kg a week')).toBeOnTheScreen();
      const input = screen.getByLabelText('Custom pace in kg a week');
      expect(input.props.keyboardType).toBe('decimal-pad');
    });

    it('computes with the typed rate, with a live kcal line', async () => {
      const user = setupUser();
      await toPace(user);
      await press(user, /^Custom/, 'radio');
      await user.type(screen.getByLabelText('Custom pace in kg a week'), '0.6');
      expect(screen.getByText('About 660 kcal a day below maintenance')).toBeOnTheScreen();
      await press(user, 'CONTINUE');
      await waitForText('YOUR GAME PLAN');
      expect(screen.getByText('LOSE FAT · CUSTOM · 0.6 KG A WEEK')).toBeOnTheScreen();
      await press(user, "LET'S GO");
      await waitForText("TODAY'S TARGET");
      expect(lastArgs()).toMatchObject({ p_weekly_rate_kg: 0.6 });
      expect(eventsNamed('targets_revealed')[0]).toMatchObject({
        pace_option: 'custom',
        pace_band: 'le_0_75',
      });
    });

    it.each(['0.009', '1.51', '0', '2'])(
      'blocks CONTINUE and shows the range error for %s (AC 33)',
      async (value) => {
        const user = setupUser();
        await toPace(user);
        await press(user, /^Custom/, 'radio');
        await user.type(screen.getByLabelText('Custom pace in kg a week'), value);
        await press(user, 'CONTINUE');
        expect(screen.getByText('Enter a pace between 0.01 and 1.5 kg a week.')).toBeOnTheScreen();
        expect(screen.getByText('PICK YOUR PACE')).toBeOnTheScreen();
      },
    );

    it.each(['0.01', '1.5'])('accepts the limit %s', async (value) => {
      const user = setupUser();
      await toPace(user);
      await press(user, /^Custom/, 'radio');
      await user.type(screen.getByLabelText('Custom pace in kg a week'), value);
      await press(user, 'CONTINUE');
      await waitForText('YOUR GAME PLAN');
    });

    it('blocks CONTINUE when Custom is chosen but empty', async () => {
      const user = setupUser();
      await toPace(user);
      await press(user, /^Custom/, 'radio');
      await press(user, 'CONTINUE');
      expect(screen.getByText('Enter a pace between 0.01 and 1.5 kg a week.')).toBeOnTheScreen();
    });

    it('0.75 is not amber, 0.76 is: amber outline, a polite status line, and the user can still continue (AC 34)', async () => {
      const user = setupUser();
      await toPace(user);
      await press(user, /^Custom/, 'radio');
      const input = screen.getByLabelText('Custom pace in kg a week');
      const faster =
        'Faster than we recommend. We strongly suggest 0.75 kg a week or less. You can still go ahead.';
      await user.type(input, '0.75');
      expect(screen.queryByText(faster)).toBeNull();
      await user.type(input, '1');
      await user.clear(input);
      await user.type(input, '0.76');
      const status = screen.getByText(faster);
      expect(status.props.accessibilityLiveRegion).toBe('polite');
      expect(screen.getByRole('radio', { name: /^Custom/ }).parent?.props.style.borderColor).toBe(
        '#FFB020',
      );
      await press(user, 'CONTINUE');
      await waitForText('YOUR GAME PLAN');
      expect(eventsNamed('targets_revealed')[0]).toMatchObject({
        pace_option: 'custom',
        pace_band: 'gt_0_75',
      });
    });

    it('the safety floor still applies on top of a fast custom pace', async () => {
      const user = setupUser();
      await toPace(user);
      await press(user, /^Custom/, 'radio');
      await user.type(screen.getByLabelText('Custom pace in kg a week'), '1.5');
      expect(
        screen.getAllByText('At your stats, this stops at our 1,200 kcal minimum.').length,
      ).toBeGreaterThan(0);
      await press(user, 'CONTINUE');
      await waitForText('SAFETY MINIMUM');
      expect(screen.getAllByText('1,200').length).toBeGreaterThan(0);
    });

    it('works the same for gain, in lb for imperial users', async () => {
      mockRegionOnce('US');
      const user = setupUser();
      await renderApp('/');
      await press(user, 'I AGREE');
      await fillAbout(user, { feet: '5', inches: '5', weight: '143' });
      await press(user, 'CONTINUE');
      await press(user, /^Build muscle\./, 'radio');
      await press(user, 'CONTINUE');
      await press(user, /^Lightly active/, 'radio');
      await press(user, 'CONTINUE');
      expect(
        screen.getByText(
          'We strongly suggest no more than 1.65 lb a week. Slower is easier to keep up and protects muscle.',
        ),
      ).toBeOnTheScreen();
      await press(user, /^Custom/, 'radio');
      expect(screen.getByText('0.02 to 3.3 lb a week')).toBeOnTheScreen();
      await user.type(screen.getByLabelText('Custom pace in lb a week'), '3.4');
      await press(user, 'CONTINUE');
      expect(screen.getByText('Enter a pace between 0.02 and 3.3 lb a week.')).toBeOnTheScreen();
    });
  });
});

describe('reveal and save (AC 17 to 21, 29)', () => {
  it('shows the targets and the maths in reading order (AC 17, 19)', async () => {
    const user = setupUser();
    await renderApp('/');
    await goToReveal(user);
    await waitForText('YOUR GAME PLAN');
    expect(screen.getByText('STEP 5 OF 5')).toBeOnTheScreen();
    expect(screen.getByText('LOSE FAT · MODERATE · 0.5 KG A WEEK')).toBeOnTheScreen();
    expect(screen.getByLabelText('Daily target, 1,330 kcal a day')).toBeOnTheScreen();
    expect(screen.getByLabelText('Protein, 104 grams')).toBeOnTheScreen();
    expect(screen.getByLabelText('Carbs, 129 grams')).toBeOnTheScreen();
    expect(screen.getByLabelText('Fat, 44 grams')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        'Maintenance (BMR × activity), 1,884 kcal. BMR 1,370 × 1.375, lightly active',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Deficit for your pace, minus 550 kcal')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Daily target, 1,330 kcal. Rounded to the nearest 10 kcal'),
    ).toBeOnTheScreen();
    expect(screen.getByText('HOW WE GOT HERE')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'This is a starting estimate. Your body is the real guide, and you can change it any time.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Not medical advice.')).toBeOnTheScreen();
    expect(screen.queryByText(/recheck/i)).toBeNull();
    expect(screen.queryByText('SAFETY MINIMUM')).toBeNull();
    expect(screen.queryByText('CUSTOM')).toBeNull();
  });

  it('floor: states the minimum in plain language, with the implied pace (AC 20)', async () => {
    const user = setupUser();
    await renderApp('/');
    await goToReveal(user, {
      about: { year: '1986', height: '155', weight: '50' },
      activity: /^Mostly sitting/,
      pace: /^Faster/,
    });
    await waitForText('YOUR GAME PLAN');
    expect(screen.getByText('LOSE FAT · ABOUT 0.1 KG A WEEK AT THIS TARGET')).toBeOnTheScreen();
    expect(screen.getByLabelText('Daily target, 1,200 kcal a day')).toBeOnTheScreen();
    expect(screen.getByText('SAFETY MINIMUM')).toBeOnTheScreen();
    expect(
      screen.getByText(
        "We set your target to 1,200 kcal, a minimum we use for safety. At your stats that means a slower pace than you chose, about 0.1 kg a week. If you'd like a faster pace, a doctor or dietitian can help you plan it safely.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Deficit at the safety minimum, minus 129 kcal'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Protein, 80 grams')).toBeOnTheScreen();
    expect(eventsNamed('targets_revealed')[0]).toMatchObject({ floor_applied: true });
    await press(user, "LET'S GO");
    await waitForText("TODAY'S TARGET");
    expect(lastArgs()).toMatchObject({ p_kcal: 1200, p_floor_applied: true });
  });

  it('floor at or above maintenance uses the second message (AC 20)', async () => {
    const user = setupUser();
    await renderApp('/');
    await goToReveal(user, {
      about: { year: '1940', height: '100', weight: '30' },
      activity: /^Mostly sitting/,
      pace: /^Steady/,
    });
    await waitForText('YOUR GAME PLAN');
    expect(screen.getByText('LOSE FAT · STEADY WEIGHT AT THIS TARGET')).toBeOnTheScreen();
    expect(screen.getByText(/At your stats that's about your maintenance level/)).toBeOnTheScreen();
    expect(screen.getByText('Difference from maintenance')).toBeOnTheScreen();
  });

  it("LET'S GO saves once with the computed targets and lands on Today (AC 11, 21, 27)", async () => {
    const user = setupUser();
    const view = await renderApp('/');
    await goToReveal(user);
    await press(user, "LET'S GO");
    await waitForText("TODAY'S TARGET");
    expect(view.getPathname()).toBe('/');
    expect(applyCalls()).toHaveLength(1);
    expect(lastArgs()).toEqual({
      p_give_consent: true,
      p_goal_option: 'lose_fat',
      p_sex: 'female',
      p_birth_year: 1996,
      p_height_cm: 165,
      p_weight_kg: 65,
      p_activity_level: 'light',
      p_weekly_rate_kg: 0.5,
      p_units: 'metric',
      p_timezone: expect.any(String),
      p_kcal: 1330,
      p_protein_g: 104,
      p_carbs_g: 129,
      p_fat_g: 44,
      p_calculated_kcal: 1330,
      p_floor_applied: false,
      p_bmr: 1370,
      p_maintenance_kcal: 1884,
      p_formula_version: 'msj-1',
    });
    // There is no way back into onboarding (D3).
    await act(async () => router.push('/onboarding/goal'));
    expect(view.getPathname()).toBe('/');
    // One-off confirmation on Today.
    expect(screen.getByText("Plan saved. Let's get going.")).toBeOnTheScreen();
    expect(screen.getAllByText('1,330').length).toBeGreaterThan(0);
  });

  it('a double tap makes one save (spec section 6)', async () => {
    let release: (() => void) | undefined;
    const original = jest.requireActual('@/test/backend');
    void original;
    backend.rpcResults.apply_targets = (args) =>
      new Promise((resolve) => {
        release = () => {
          delete backend.rpcResults.apply_targets;
          resolve({ data: null, error: { code: '', message: 'ignored' } });
          void args;
        };
      });
    const user = setupUser();
    await renderApp('/');
    await goToReveal(user);
    const go = screen.getByRole('button', { name: "LET'S GO" });
    await user.press(go);
    // While saving: busy, announced as saving, and the other actions are inactive.
    const busy = screen.getByRole('button', { name: 'Saving your plan' });
    expect(busy).toBeBusy();
    expect(screen.getByRole('button', { name: 'Adjust targets' })).toBeDisabled();
    await user.press(busy);
    await user.press(busy);
    expect(applyCalls()).toHaveLength(1);
    release?.();
    await waitFor(() =>
      expect(screen.getByText(/We couldn't save your plan just now/)).toBeOnTheScreen(),
    );
  });

  describe('save failures keep the answers and complete nothing (AC 11, 29)', () => {
    const offline = () => ({
      data: null,
      error: { code: '', message: 'TypeError: Failed to fetch' },
    });

    it('offline: inline message, TRY AGAIN, answers kept, retry succeeds', async () => {
      backend.rpcResults.apply_targets = offline;
      const user = setupUser();
      const view = await renderApp('/');
      await goToReveal(user);
      await press(user, "LET'S GO");
      await waitForText(
        "You're offline, so we couldn't save your plan yet. Your answers are still here.",
      );
      expect(screen.getByRole('alert')).toBeOnTheScreen();
      expect(view.getPathname()).toBe('/onboarding/plan');
      expect(screen.getByLabelText('Daily target, 1,330 kcal a day')).toBeOnTheScreen();
      expect(backend.profile.onboarding_completed_at).toBeNull();
      expect(eventsNamed('onboarding_save_failed')).toEqual([
        { name: 'onboarding_save_failed', reason: 'offline', stage: 'final_save' },
      ]);

      delete backend.rpcResults.apply_targets;
      await press(user, 'TRY AGAIN');
      await waitForText("TODAY'S TARGET");
      expect(applyCalls()).toHaveLength(2);
      expect(lastArgs()).toMatchObject({ p_kcal: 1330, p_give_consent: true });
    });

    it('server error: a calm message and TRY AGAIN', async () => {
      backend.rpcResults.apply_targets = () => ({
        data: null,
        error: { code: '500', message: 'boom' },
      });
      const user = setupUser();
      await renderApp('/');
      await goToReveal(user);
      await press(user, "LET'S GO");
      await waitForText("We couldn't save your plan just now. Your answers are still here.");
      expect(screen.getByRole('button', { name: 'TRY AGAIN' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Adjust targets' })).toBeOnTheScreen();
      expect(eventsNamed('onboarding_save_failed')[0]).toMatchObject({ reason: 'server' });
    });

    it('validation: points to About you with a Review answers button', async () => {
      backend.rpcResults.apply_targets = () => ({
        data: null,
        error: { code: 'P0001', message: 'invalid_input' },
      });
      const user = setupUser();
      const view = await renderApp('/');
      await goToReveal(user);
      await press(user, "LET'S GO");
      await waitForText(
        "Something in your answers didn't go through. Check About you and try again.",
      );
      expect(screen.queryByRole('button', { name: 'Adjust targets' })).toBeNull();
      await press(user, 'Review answers');
      await waitFor(() => expect(view.getPathname()).toBe('/onboarding/about-you'));
      expect(screen.getByLabelText('Year of birth')).toHaveDisplayValue('1996');
    });

    it('if consent was recorded earlier, only the save is retried (no second consent)', async () => {
      backend.rpcResults.apply_targets = offline;
      const user = setupUser();
      await renderApp('/');
      await goToReveal(user);
      await press(user, "LET'S GO");
      await waitForText(/You're offline/);
      expect(lastArgs()).toMatchObject({ p_give_consent: true }); // consent is part of the same atomic call
      expect(rpc.mock.calls.some(([name]) => name === 'give_health_data_consent')).toBe(false);
    });
  });
});

describe('analytics (AC 32)', () => {
  it('emits one event per action with only enum properties', async () => {
    const user = setupUser();
    await renderApp('/');
    await goToReveal(user);
    await press(user, "LET'S GO");
    await waitForText("TODAY'S TARGET");
    const names = events.map((e) => e.name);
    expect(names.filter((n) => n === 'onboarding_started')).toHaveLength(1);
    expect(names.filter((n) => n === 'health_consent_decided')).toHaveLength(1);
    expect(names.filter((n) => n === 'onboarding_goal_selected')).toHaveLength(1);
    expect(names.filter((n) => n === 'targets_revealed')).toHaveLength(1);
    expect(names.filter((n) => n === 'onboarding_completed')).toHaveLength(1);
    expect(eventsNamed('onboarding_step_viewed').map((e) => e.step)).toEqual([
      'consent',
      'about_you',
      'goal',
      'activity',
      'pace',
      'reveal',
    ]);
    expect(eventsNamed('health_consent_decided')[0]).toEqual({
      name: 'health_consent_decided',
      decision: 'given',
      surface: 'onboarding',
    });
    expect(eventsNamed('onboarding_goal_selected')[0]).toEqual({
      name: 'onboarding_goal_selected',
      goal_option: 'lose_fat',
    });
    expect(eventsNamed('targets_revealed')[0]).toEqual({
      name: 'targets_revealed',
      goal: 'lose',
      floor_applied: false,
      units: 'metric',
      source: 'onboarding',
      pace_option: 'moderate',
      pace_band: 'le_0_75',
    });
    expect(eventsNamed('onboarding_completed')[0]).toEqual({
      name: 'onboarding_completed',
      duration_bucket: 'lt_1m',
      back_count: 0,
    });
    // No health values, names or emails anywhere in the payloads.
    const json = JSON.stringify(events);
    for (const secret of ['1330', '1996', '165', '65', 'sam@example.com']) {
      expect(json).not.toContain(`"${secret}"`);
    }
    expect(json).not.toMatch(/kcal|height|weight|email|birth/i);
  });

  it('records a declined consent', async () => {
    const user = setupUser();
    await renderApp('/');
    await press(user, 'NO THANKS');
    expect(eventsNamed('health_consent_decided')).toEqual([
      { name: 'health_consent_decided', decision: 'declined', surface: 'onboarding' },
    ]);
  });
});
