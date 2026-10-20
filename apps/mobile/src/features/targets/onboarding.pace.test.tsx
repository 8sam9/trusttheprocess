import { screen, waitFor } from 'expo-router/testing-library';
import { backend, rpc } from '@/test/backend';
import { eventsNamed } from '@/test/analyticsSpy';
import { fillAbout, press } from '@/test/flows';
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

    it('focuses the revealed input so it is in view (QA bug 6)', async () => {
      const user = setupUser();
      await toPace(user);
      expect(screen.queryByLabelText('Custom pace in kg a week')).toBeNull();
      await press(user, /^Custom/, 'radio');
      expect(screen.getByLabelText('Custom pace in kg a week').props.autoFocus).toBe(true);
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
      // R1: the message lives in the pinned notice slot above CONTINUE, announced as a polite alert.
      expect(screen.getByText(faster)).toBeOnTheScreen();
      expect(screen.getByRole('alert').props.accessibilityLiveRegion).toBe('polite');
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
