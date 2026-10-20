import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { authStorage } from '@/lib/authStorage';
import { eventsNamed } from '@/test/analyticsSpy';
import { backend, from, rpc } from '@/test/backend';
import { goToReveal, press } from '@/test/flows';
import { renderApp, setupUser } from '@/test/render';

jest.mock('@/lib/supabase', () => ({ supabase: jest.requireActual('@/test/backend').supabase }));
jest.mock('@/lib/auth', () => jest.requireActual('@/test/backend').authModule);

beforeEach(() => {
  backend.reset();
  authStorage?.clear();
});

type User = ReturnType<typeof setupUser>;

/** Renders onboarding up to the reveal and opens the Adjust sheet. */
async function openAdjust(user: User, opts: Parameters<typeof goToReveal>[1] = {}) {
  await renderApp('/');
  await waitFor(() => expect(screen.getByText('YOUR DATA, YOUR CALL')).toBeOnTheScreen());
  await goToReveal(user, opts);
  await waitFor(() => expect(screen.getByText('YOUR GAME PLAN')).toBeOnTheScreen());
  rpc.mockClear();
  from.mockClear();
  await press(user, 'Adjust targets');
  await waitFor(() => expect(screen.getByText('ADJUST YOUR PLAN')).toBeOnTheScreen());
  return within(screen.getByLabelText('ADJUST YOUR PLAN'));
}
const applyCalls = () => rpc.mock.calls.filter(([name]) => name === 'apply_targets');

describe('Adjust sheet (S7, AC 21, 22)', () => {
  it('opens without any network call and shows the summary, rows and calories', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(sheet.getByText('1,330 kcal')).toBeOnTheScreen();
    expect(
      sheet.getByLabelText('Protein 104 grams, carbs 129 grams, fat 44 grams'),
    ).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'Goal, Lose fat' })).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'Pace, Moderate · 0.5 kg a week' })).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'Activity, Lightly active' })).toBeOnTheScreen();
    expect(
      sheet.getByRole('button', { name: 'About you, Female · 1996 · 165 cm · 65 kg' }),
    ).toBeOnTheScreen();
    expect(sheet.getByText('DAILY CALORIES')).toBeOnTheScreen();
    expect(sheet.getByText('Calculated: 1,330 kcal')).toBeOnTheScreen();
    expect(
      sheet.getByText('Protein stays at 104 g. Carbs and fat adjust to match.'),
    ).toBeOnTheScreen();
    expect(sheet.queryByRole('button', { name: 'Use calculated' })).toBeNull();
    expect(sheet.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    expect(eventsNamed('targets_adjust_opened')).toEqual([
      { name: 'targets_adjust_opened', source: 'onboarding' },
    ]);
  });

  it('adjusts calories by 50, marks the target custom on the reveal, and saves both numbers (AC 22)', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user);
    await user.press(sheet.getByRole('button', { name: 'Increase by 50' }));
    expect(sheet.getByText('1,380 kcal')).toBeOnTheScreen();
    expect(sheet.getByText('Custom · calculated was 1,330')).toBeOnTheScreen();
    expect(
      sheet.getByRole('adjustable', { name: 'Daily calories, 1,380 kcal. Adjustable.' }),
    ).toBeOnTheScreen();
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(screen.queryByText('ADJUST YOUR PLAN')).toBeNull();
    expect(screen.getByText('CUSTOM')).toBeOnTheScreen();
    expect(screen.getByLabelText('Daily target, 1,380 kcal a day')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Your adjustment, plus 50 kcal. Calculated target was 1,330'),
    ).toBeOnTheScreen();
    expect(rpc).not.toHaveBeenCalled(); // nothing is saved by the sheet
    await press(user, "LET'S GO");
    await waitFor(() => expect(screen.getByText("TODAY'S TARGET")).toBeOnTheScreen());
    expect(applyCalls()).toHaveLength(1);
    expect(applyCalls()[0]?.[1]).toMatchObject({
      p_kcal: 1380,
      p_calculated_kcal: 1330,
      p_protein_g: 104,
    });
    expect(eventsNamed('targets_manual_override')).toEqual([
      { name: 'targets_manual_override', direction: 'up' },
    ]);
  });

  it('"Use calculated" undoes the manual value', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user);
    await user.press(sheet.getByRole('button', { name: 'Decrease by 50' }));
    expect(sheet.getByText('1,280 kcal')).toBeOnTheScreen();
    await user.press(sheet.getByRole('button', { name: 'Use calculated' }));
    expect(sheet.getByText('1,330 kcal')).toBeOnTheScreen();
    expect(sheet.queryByRole('button', { name: 'Use calculated' })).toBeNull();
    expect(eventsNamed('targets_manual_override').map((e) => e.direction)).toEqual(['down']);
  });

  it('will not go below the floor: snaps, explains, disables minus, and reports no number (AC 22)', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user);
    await user.press(sheet.getByRole('button', { name: 'Decrease by 50' }));
    await user.press(sheet.getByRole('button', { name: 'Decrease by 50' }));
    await user.press(sheet.getByRole('button', { name: 'Decrease by 50' }));
    expect(sheet.getByText('1,200 kcal')).toBeOnTheScreen();
    expect(
      sheet.getByText(
        "1,200 kcal is the lowest target we set in the app. If you'd like to go lower, a doctor or dietitian can help you do it safely.",
      ),
    ).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'Decrease by 50' })).toBeDisabled();
    expect(eventsNamed('targets_manual_override').at(-1)).toEqual({
      name: 'targets_manual_override',
      direction: 'blocked_by_floor',
    });
    // Typing a value below the floor snaps it too.
    await user.press(sheet.getByRole('button', { name: 'Increase by 50' }));
    const field = sheet.getByRole('adjustable');
    await fireEvent.changeText(field, '900');
    await fireEvent(field, 'blur');
    expect(sheet.getByText('1,200 kcal')).toBeOnTheScreen();
    expect(JSON.stringify(eventsNamed('targets_manual_override'))).not.toMatch(/\d{4}/);
  });

  it('caps a typed value at 6,000 kcal with a calm message', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user);
    const field = sheet.getByRole('adjustable');
    await fireEvent.changeText(field, '13300');
    await fireEvent(field, 'blur');
    expect(sheet.getByText('6,000 kcal')).toBeOnTheScreen();
    expect(sheet.getByText('That looks high. Try up to 6,000 kcal.')).toBeOnTheScreen();
  });

  it('says when protein is capped at 35% of calories, with the real value', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user, {
      about: { sex: 'Male', year: '1990', height: '185', weight: '95' },
    });
    const field = sheet.getByRole('adjustable');
    await fireEvent.changeText(field, '1500');
    await fireEvent(field, 'blur');
    expect(
      sheet.getByText("Protein is capped at 35% of calories at this level, so it's 131 g."),
    ).toBeOnTheScreen();
  });

  it('edits the goal on a pushed page; maintain hides the pace row (AC 7), and the reveal updates', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user);
    await user.press(sheet.getByRole('button', { name: 'Goal, Lose fat' }));
    expect(sheet.getByText('Goal')).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    await user.press(sheet.getByRole('radio', { name: /^Just track\./ }));
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(sheet.getByText('ADJUST YOUR PLAN')).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'Goal, Just track' })).toBeOnTheScreen();
    expect(sheet.queryByRole('button', { name: /^Pace,/ })).toBeNull();
    expect(sheet.getByText('1,880 kcal')).toBeOnTheScreen();
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(screen.getByText('JUST TRACK · STEADY WEIGHT')).toBeOnTheScreen();
    expect(screen.getByLabelText('Goal adjustment, 0 kcal')).toBeOnTheScreen();
  });

  it('shows the 0.75 recommendation on the Pace page (AC 35) and accepts a custom pace there', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user);
    await user.press(sheet.getByRole('button', { name: /^Pace,/ }));
    expect(
      sheet.getByText(
        'We strongly suggest no more than 0.75 kg a week. Slower is easier to keep up and protects muscle.',
      ),
    ).toBeOnTheScreen();
    await user.press(sheet.getByRole('radio', { name: /^Custom/ }));
    await user.type(sheet.getByLabelText('Custom pace in kg a week'), '1.6');
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(sheet.getByText('Enter a pace between 0.01 and 1.5 kg a week.')).toBeOnTheScreen();
    expect(sheet.getByText('Pace')).toBeOnTheScreen(); // still on the page
    await user.clear(sheet.getByLabelText('Custom pace in kg a week'));
    await user.type(sheet.getByLabelText('Custom pace in kg a week'), '0.4');
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(sheet.getByRole('button', { name: 'Pace, Custom · 0.4 kg a week' })).toBeOnTheScreen();
  });

  it('validates About you inline, and shows the under-16 message without locking the account', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user);
    await user.press(sheet.getByRole('button', { name: /^About you,/ }));
    const year = sheet.getByLabelText('Year of birth');
    await user.clear(year);
    await user.type(year, '2015');
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(
      sheet.getByText('You need to be 16 or over to use TrustTheProcess. Check the year.'),
    ).toBeOnTheScreen();
    expect(sheet.getByText('About you')).toBeOnTheScreen();
    await user.clear(year);
    await user.type(year, '1990');
    await user.clear(sheet.getByLabelText('Height (cm)'));
    await user.type(sheet.getByLabelText('Height (cm)'), '90');
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    await user.press(sheet.getByRole('button', { name: 'Back' }));
    expect(sheet.getByText('That height looks off. Try between 100 and 250 cm.')).toBeOnTheScreen();
    await user.clear(sheet.getByLabelText('Height (cm)'));
    await user.type(sheet.getByLabelText('Height (cm)'), '170');
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(
      sheet.getByRole('button', { name: 'About you, Female · 1990 · 170 cm · 65 kg' }),
    ).toBeOnTheScreen();
  });

  it('drops a manual value when an input changes and says so (Gate 2 resolution 5)', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user);
    await user.press(sheet.getByRole('button', { name: 'Increase by 50' }));
    await user.press(sheet.getByRole('button', { name: /^Activity,/ }));
    await user.press(sheet.getByRole('radio', { name: /^Very active/ }));
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(
      sheet.getByText('Your inputs changed, so we recalculated your target.'),
    ).toBeOnTheScreen();
    expect(sheet.queryByRole('button', { name: 'Use calculated' })).toBeNull();
    expect(sheet.getByText(/^Calculated: /)).toBeOnTheScreen();
  });

  it('blocks DONE with a clear message when the guard makes Lose fat unavailable', async () => {
    const user = setupUser();
    const sheet = await openAdjust(user);
    await user.press(sheet.getByRole('button', { name: /^About you,/ }));
    await user.clear(sheet.getByLabelText('Current weight (kg)'));
    await user.type(sheet.getByLabelText('Current weight (kg)'), '40');
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(sheet.getByRole('button', { name: 'Goal, Choose a goal' })).toBeOnTheScreen();
    expect(
      sheet.getByText(
        /For your age and body, we'll set you up to maintain or build rather than lose\./,
      ),
    ).toBeOnTheScreen();
    expect(sheet.getByText('Choose another goal to continue.')).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'DONE' })).toBeDisabled();
    expect(screen.queryByText(/bmi/i)).toBeNull();
    // Choosing another goal clears the block.
    await user.press(sheet.getByRole('button', { name: 'Goal, Choose a goal' }));
    expect(
      sheet.getByRole('radio', { name: 'Lose fat, unavailable. See note above.' }),
    ).toBeDisabled();
    await user.press(sheet.getByRole('radio', { name: /^Build muscle\./ }));
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(sheet.getByRole('button', { name: 'DONE' })).toBeEnabled();
  });

  describe('closing', () => {
    it('closes at once when nothing changed', async () => {
      const user = setupUser();
      const sheet = await openAdjust(user);
      await user.press(sheet.getByRole('button', { name: 'Close' }));
      expect(screen.queryByText('ADJUST YOUR PLAN')).toBeNull();
      expect(screen.queryByText('Discard your changes?')).toBeNull();
    });

    it('asks before discarding changes, and discarding leaves the plan untouched', async () => {
      const user = setupUser();
      const sheet = await openAdjust(user);
      await user.press(sheet.getByRole('button', { name: 'Increase by 50' }));
      await user.press(sheet.getByRole('button', { name: 'Close' }));
      expect(screen.getByText('Discard your changes?')).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Keep editing' }));
      expect(sheet.getByText('1,380 kcal')).toBeOnTheScreen();
      await user.press(sheet.getByRole('button', { name: 'Close' }));
      await user.press(screen.getByRole('button', { name: 'Discard' }));
      expect(screen.queryByText('ADJUST YOUR PLAN')).toBeNull();
      expect(screen.queryByText('CUSTOM')).toBeNull();
      expect(screen.getByLabelText('Daily target, 1,330 kcal a day')).toBeOnTheScreen();
    });

    it('the Android back button leaves a pushed page first, then asks to discard', async () => {
      const user = setupUser();
      const sheet = await openAdjust(user);
      await user.press(sheet.getByRole('button', { name: 'Goal, Lose fat' }));
      await user.press(sheet.getByRole('radio', { name: /^Just track\./ }));
      await fireEvent(sheet.getByText('Goal'), 'requestClose');
      expect(sheet.getByText('ADJUST YOUR PLAN')).toBeOnTheScreen();
      await fireEvent(sheet.getByText('ADJUST YOUR PLAN'), 'requestClose');
      expect(screen.getByText('Discard your changes?')).toBeOnTheScreen();
    });
  });
});
