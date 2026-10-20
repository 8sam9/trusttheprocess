import { resolvePrivacyUrl } from './env';

describe('resolvePrivacyUrl', () => {
  it('uses the configured URL', () => {
    const warn = jest.fn();
    expect(resolvePrivacyUrl(' https://ttp.example/privacy ', true, warn)).toBe(
      'https://ttp.example/privacy',
    );
    expect(warn).not.toHaveBeenCalled();
  });
  it('keeps a placeholder in development and warns', () => {
    const warn = jest.fn();
    expect(resolvePrivacyUrl(undefined, false, warn)).toContain('example.com');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EXPO_PUBLIC_PRIVACY_URL'));
  });
  it('returns null in production so the UI shows "coming soon"', () => {
    expect(resolvePrivacyUrl('', true, jest.fn())).toBeNull();
  });
});
