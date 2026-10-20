import { screen, userEvent } from '@testing-library/react-native';

type User = ReturnType<typeof userEvent.setup>;

export interface AboutAnswers {
  sex?: 'Female' | 'Male' | 'Prefer not to say';
  year?: string;
  height?: string;
  feet?: string;
  inches?: string;
  weight?: string;
}

export const press = (user: User, name: string | RegExp, role: 'button' | 'radio' = 'button') =>
  user.press(screen.getByRole(role, { name }));

export async function fillAbout(user: User, a: AboutAnswers = {}) {
  const { sex = 'Female', year = '1996', height = '165', weight = '65' } = a;
  await press(user, sex, 'radio');
  await user.type(screen.getByLabelText('Year of birth'), year);
  if (a.feet !== undefined) {
    await user.type(screen.getByLabelText('Height (ft)'), a.feet);
    if (a.inches) await user.type(screen.getByLabelText('Height (in)'), a.inches);
  } else {
    await user.type(screen.getByLabelText('Height (cm)'), height);
  }
  await user.type(screen.getByLabelText(/Current weight/), weight);
}

/** Consent through to the reveal for the AC 17 worked example (or the given answers). */
export async function goToReveal(
  user: User,
  opts: {
    about?: AboutAnswers;
    goal?: string | RegExp;
    activity?: string | RegExp;
    pace?: string | RegExp;
    consent?: boolean;
  } = {},
) {
  if (opts.consent !== false) await press(user, 'I AGREE');
  await fillAbout(user, opts.about);
  await press(user, 'CONTINUE');
  await press(user, opts.goal ?? /^Lose fat\./, 'radio');
  await press(user, 'CONTINUE');
  await press(user, opts.activity ?? /^Lightly active/, 'radio');
  await press(user, 'CONTINUE');
  if (opts.pace) await press(user, opts.pace, 'radio');
  const isMaintain = opts.goal !== undefined && /Fuel|Just track/i.test(String(opts.goal));
  if (!isMaintain) await press(user, 'CONTINUE');
}
