import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { authStorage } from '@/lib/authStorage';
import { eventsNamed } from '@/test/analyticsSpy';
import { backend, makeProfile, makeTargets, rpc } from '@/test/backend';
import { insideScrollView } from '@/test/scroll';
import { press } from '@/test/flows';
import { renderApp, setupUser } from '@/test/render';

jest.mock('@/lib/supabase', () => ({ supabase: require('@/test/backend').supabase }));
jest.mock('@/lib/auth', () => require('@/test/backend').authModule);

const DONE_AT = '2026-10-19T08:00:00+00:00';
const applyCalls = () => rpc.mock.calls.filter(([name]) => name === 'apply_targets');

beforeEach(() => {
  backend.reset();
  authStorage?.clear();
  backend.profile = makeProfile({
    display_name: 'Sam',
    sex: 'female',
    birth_year: 1996,
    height_cm: 165,
    weight_kg: 65,
    activity_level: 'light',
    goal: 'lose',
    goal_option: 'lose_fat',
    weekly_rate_kg: 0.5,
    onboarding_completed_at: DONE_AT,
    health_data_consent_at: DONE_AT,
  });
  backend.targets = [makeTargets()];
});

async function openSettings(overrides: { consent?: boolean } = {}) {
  if (overrides.consent === false)
    backend.profile = { ...backend.profile, health_data_consent_at: null };
  const view = await renderApp('/settings');
  await waitFor(() => expect(screen.getByText('DAILY TARGETS')).toBeOnTheScreen());
  return view;
}

async function openEdit(user: ReturnType<typeof setupUser>) {
  await press(user, 'Edit targets');
  await waitFor(() => expect(screen.getByText('EDIT YOUR TARGETS')).toBeOnTheScreen());
  rpc.mockClear();
  return within(screen.getByLabelText('EDIT YOUR TARGETS'));
}

describe('Daily targets card (AC 24)', () => {
  it('shows the stored numbers, inputs, tags and effective date', async () => {
    await openSettings();
    expect(screen.getByLabelText('1,330 kcal a day')).toBeOnTheScreen();
    expect(
      screen.getByText('Lose fat · Moderate, 0.5 kg a week · Lightly active'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Female · born 1996 · 165 cm · 65 kg')).toBeOnTheScreen();
    expect(screen.getByText('In effect since 19 Oct 2026')).toBeOnTheScreen();
    expect(screen.queryByText('CUSTOM')).toBeNull();
    expect(screen.queryByText(/Health-data consent is off/)).toBeNull();
  });

  it('shows tags for custom and safety-minimum targets', async () => {
    backend.targets = [makeTargets({ kcal: 1380, is_custom: true, floor_applied: true })];
    await openSettings();
    expect(screen.getByText('CUSTOM')).toBeOnTheScreen();
    expect(screen.getByText('SAFETY MINIMUM')).toBeOnTheScreen();
  });

  it('shows imperial values in the user units while storage stays metric', async () => {
    backend.profile = { ...backend.profile, units: 'imperial' };
    await openSettings();
    expect(
      screen.getByText('Lose fat · Moderate, 1.1 lb a week · Lightly active'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Female · born 1996 · 5 ft 5 in · 143.3 lb')).toBeOnTheScreen();
  });

  it('notes when consent is off (AC 10)', async () => {
    await openSettings({ consent: false });
    expect(
      screen.getByText(
        "Health-data consent is off. If you edit your targets, we'll ask for it again.",
      ),
    ).toBeOnTheScreen();
  });

  it('is absent when the user has not onboarded (the gate sends them to onboarding)', async () => {
    backend.profile = makeProfile();
    backend.targets = [];
    await renderApp('/settings');
    await waitFor(() => expect(screen.getByText('YOUR DATA, YOUR CALL')).toBeOnTheScreen());
    expect(screen.queryByText('DAILY TARGETS')).toBeNull();
  });
});

describe('Edit targets sheet (AC 25, 26)', () => {
  it('starts inactive with no change, then previews old to new and applies', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-20T10:00:00Z') });
    const user = setupUser();
    await openSettings();
    const sheet = await openEdit(user);
    expect(sheet.getByText('Change something above to see your new targets.')).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'APPLY FROM TODAY' })).toBeDisabled();
    expect(eventsNamed('targets_adjust_opened')).toEqual([
      { name: 'targets_adjust_opened', source: 'settings' },
    ]);

    await user.press(sheet.getByRole('button', { name: /^Activity,/ }));
    await user.press(sheet.getByRole('radio', { name: /^Moderately active/ }));
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(sheet.getByText(/^1,330 → [\d,]+ kcal$/)).toBeOnTheScreen();
    expect(
      sheet.getByText('Applies from today, Tue 20 Oct. Earlier days keep the targets they had.'),
    ).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'APPLY FROM TODAY' })).toBeEnabled();

    await user.press(sheet.getByRole('button', { name: 'APPLY FROM TODAY' }));
    await waitFor(() => expect(screen.queryByText('EDIT YOUR TARGETS')).toBeNull());
    expect(applyCalls()).toHaveLength(1);
    expect(applyCalls()[0]?.[1]).toMatchObject({
      p_activity_level: 'moderate',
      p_give_consent: false,
    });
    expect(screen.getByText('New targets in effect from today.')).toBeOnTheScreen();
    expect(eventsNamed('targets_updated')).toHaveLength(1);
  });

  it('keeps the preset name and the stored rate after switching to imperial (QA bug 7)', async () => {
    backend.profile = { ...backend.profile, units: 'imperial' };
    const user = setupUser();
    await openSettings();
    const sheet = await openEdit(user);
    expect(sheet.getByRole('button', { name: /^Pace, Moderate/ })).toBeOnTheScreen();
    expect(sheet.queryByText(/Custom/)).toBeNull();
    // Still the stored 0.5 kg a week (1,330 kcal), nothing to apply.
    expect(sheet.getByText('1,330 kcal')).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'APPLY FROM TODAY' })).toBeDisabled();
  });

  it('cancelling or discarding makes no call (AC 25)', async () => {
    const user = setupUser();
    await openSettings();
    let sheet = await openEdit(user);
    await user.press(sheet.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('EDIT YOUR TARGETS')).toBeNull();

    sheet = await openEdit(user);
    await user.press(sheet.getByRole('button', { name: 'Goal, Lose fat' }));
    await user.press(sheet.getByRole('radio', { name: /^Just track\./ }));
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    await user.press(sheet.getByRole('button', { name: 'Close' }));
    await user.press(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('EDIT YOUR TARGETS')).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByLabelText('1,330 kcal a day')).toBeOnTheScreen();
  });

  it('tells the user a custom target is being replaced', async () => {
    backend.targets = [makeTargets({ kcal: 1380, is_custom: true })];
    const user = setupUser();
    await openSettings();
    const sheet = await openEdit(user);
    await user.press(sheet.getByRole('button', { name: /^Activity,/ }));
    await user.press(sheet.getByRole('radio', { name: /^Very active/ }));
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(sheet.getByText('This replaces your custom target of 1,380 kcal.')).toBeOnTheScreen();
  });

  it('shows the offline copy and keeps the changes with a retry', async () => {
    backend.rpcResults.apply_targets = async () => ({
      data: null,
      error: { code: '', message: 'Network request failed' },
    });
    const user = setupUser();
    await openSettings();
    const sheet = await openEdit(user);
    await user.press(sheet.getByRole('button', { name: /^Activity,/ }));
    await user.press(sheet.getByRole('radio', { name: /^Very active/ }));
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    await user.press(sheet.getByRole('button', { name: 'APPLY FROM TODAY' }));
    await waitFor(() =>
      expect(
        sheet.getByText(
          "You're offline, so your new targets aren't saved yet. Your changes are still here.",
        ),
      ).toBeOnTheScreen(),
    );
    expect(sheet.getByRole('button', { name: 'TRY AGAIN' })).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: /^Activity, Very active/ })).toBeOnTheScreen();
    // Retry succeeds.
    delete backend.rpcResults.apply_targets;
    await user.press(sheet.getByRole('button', { name: 'TRY AGAIN' }));
    await waitFor(() => expect(screen.queryByText('EDIT YOUR TARGETS')).toBeNull());
  });

  it('shows the server copy for a server failure', async () => {
    backend.rpcResults.apply_targets = async () => ({
      data: null,
      error: { code: '500', message: 'boom' },
    });
    const user = setupUser();
    await openSettings();
    const sheet = await openEdit(user);
    await user.press(sheet.getByRole('button', { name: /^Activity,/ }));
    await user.press(sheet.getByRole('radio', { name: /^Very active/ }));
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    await user.press(sheet.getByRole('button', { name: 'APPLY FROM TODAY' }));
    await waitFor(() =>
      expect(
        sheet.getByText("We couldn't save your new targets just now. Your changes are still here."),
      ).toBeOnTheScreen(),
    );
    // Pinned above the footer, not inside the scrolling list (spec 001 QA bug 1).
    expect(insideScrollView(screen.getByText(/couldn't save your new targets/))).toBe(false);
  });

  it('shows the under-16 message inline and does not call the server', async () => {
    const user = setupUser();
    await openSettings();
    const sheet = await openEdit(user);
    await user.press(sheet.getByRole('button', { name: /^About you,/ }));
    const year = sheet.getByLabelText('Year of birth');
    await user.clear(year);
    await user.type(year, '2015');
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    expect(
      sheet.getByText('You need to be 16 or over to use TrustTheProcess. Check the year.'),
    ).toBeOnTheScreen();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('consent in the Edit sheet (AC 10)', () => {
  async function changeActivity(user: ReturnType<typeof setupUser>) {
    const sheet = await openEdit(user);
    await user.press(sheet.getByRole('button', { name: /^Activity,/ }));
    await user.press(sheet.getByRole('radio', { name: /^Very active/ }));
    await user.press(sheet.getByRole('button', { name: 'DONE' }));
    return sheet;
  }

  it('asks for consent first; declining keeps targets and makes no call', async () => {
    const user = setupUser();
    await openSettings({ consent: false });
    const sheet = await changeActivity(user);
    await user.press(sheet.getByRole('button', { name: 'APPLY FROM TODAY' }));
    await waitFor(() => expect(sheet.getByRole('button', { name: 'I AGREE' })).toBeOnTheScreen());
    expect(rpc).not.toHaveBeenCalled();
    // The page is titled for consent (not "ABOUT YOU").
    expect(sheet.getByText('YOUR DATA, YOUR CALL')).toBeOnTheScreen();
    expect(sheet.queryByText('ABOUT YOU')).toBeNull();
    await user.press(sheet.getByRole('button', { name: 'NO THANKS' }));
    expect(
      screen.getByText("We need your consent to save body stats. Your targets haven't changed."),
    ).toBeOnTheScreen();
    expect(insideScrollView(screen.getByText(/We need your consent/))).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('agreeing applies with give_consent true', async () => {
    const user = setupUser();
    await openSettings({ consent: false });
    const sheet = await changeActivity(user);
    await user.press(sheet.getByRole('button', { name: 'APPLY FROM TODAY' }));
    await user.press(await waitFor(() => sheet.getByRole('button', { name: 'I AGREE' })));
    await waitFor(() => expect(applyCalls()).toHaveLength(1));
    expect(applyCalls()[0]?.[1]).toMatchObject({ p_give_consent: true });
  });
});

describe('Profile autosave', () => {
  it('saves the name on blur and the units on change, with no Save button', async () => {
    const user = setupUser();
    await openSettings();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    const name = screen.getByLabelText('Name (optional)');
    await user.clear(name);
    await user.type(name, 'Alex');
    await fireEvent(name, 'blur');
    await waitFor(() => expect(screen.getByText('Saved')).toBeOnTheScreen());
    expect(backend.profile.display_name).toBe('Alex');

    await user.press(screen.getByRole('radio', { name: 'Imperial (lb, ft)' }));
    await waitFor(() => expect(backend.profile.units).toBe('imperial'));
    await waitFor(() => expect(screen.getByText(/143.3 lb/)).toBeOnTheScreen());
  });
});
