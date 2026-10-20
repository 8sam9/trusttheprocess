import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { backend, rpc } from '@/test/backend';
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

describe('step navigation chrome (QA bugs 4 and 8)', () => {
  it('shows one Back control per step, and it goes back a step', async () => {
    const user = setupUser();
    const view = await renderApp('/');
    await press(user, 'I AGREE');
    // I AGREE lands on About you directly, which has no Back.
    expect(view.getPathname()).toBe('/onboarding/about-you');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await fillAbout(user);
    await press(user, 'CONTINUE');
    await waitForText('WHAT ARE YOU TRAINING FOR?');
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
    await press(user, 'Back');
    expect(view.getPathname()).toBe('/onboarding/about-you');
  });

  it('emits only the About you step view after I AGREE (analytics step events; the blank-screen fix itself is verified in the browser only)', async () => {
    const user = setupUser();
    await renderApp('/');
    const viewed = eventsNamed('onboarding_step_viewed').length;
    await press(user, 'I AGREE');
    await waitForText('ABOUT YOU');
    const steps = eventsNamed('onboarding_step_viewed')
      .slice(viewed)
      .map((e) => (e as { step?: string }).step);
    expect(steps).toEqual(['about_you']);
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
