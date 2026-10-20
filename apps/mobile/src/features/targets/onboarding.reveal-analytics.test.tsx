import { act, screen, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { backend, rpc } from '@/test/backend';
import { eventsNamed, events } from '@/test/analyticsSpy';
import { goToReveal, press } from '@/test/flows';
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
