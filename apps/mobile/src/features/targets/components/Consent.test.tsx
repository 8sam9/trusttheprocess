import { render, screen } from '@testing-library/react-native';
import { ConsentBody } from './Consent';

jest.mock('@/lib/env', () => ({ privacyUrl: null }));

describe('ConsentBody without a privacy policy URL (production build)', () => {
  it('shows "Privacy policy coming soon" instead of a link', async () => {
    await render(<ConsentBody />);
    expect(screen.getByText('Privacy policy coming soon')).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: 'Read the privacy policy' })).toBeNull();
  });
});
