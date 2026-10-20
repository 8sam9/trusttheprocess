import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthProvider, useAuth } from './auth';
import { authStorage } from './authStorage';
import { gateCache } from './gateCache';

type AuthCallback = (event: string, session: unknown) => void;
const mockState: { callback: AuthCallback | null } = { callback: null };
const mockSession = { user: { id: 'u1' } };

jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockSession } })),
      onAuthStateChange: jest.fn((cb: AuthCallback) => {
        mockState.callback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
    },
  },
}));

function Probe() {
  const { session, loading } = useAuth();
  return <Text>{loading ? 'loading' : session ? 'signed-in' : 'signed-out'}</Text>;
}

describe('sign-out clears the device and query caches', () => {
  beforeEach(() => authStorage?.clear());

  it('removes the previous account state so the next user never sees it', async () => {
    const client = new QueryClient();
    client.setQueryData(['profile', 'u1'], { display_name: 'Sam' });
    client.setQueryData(['targets', 'u1'], []);
    gateCache.update('u1', { onboardingCompleted: true });
    gateCache.setPendingUnderageReset('u1');

    await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('signed-in')).toBeOnTheScreen());
    expect(gateCache.read('u1')?.onboardingCompleted).toBe(true);

    mockState.callback?.('SIGNED_OUT', null);

    await waitFor(() => expect(screen.getByText('signed-out')).toBeOnTheScreen());
    expect(gateCache.read('u1')).toBeNull();
    expect(gateCache.hasPendingUnderageReset('u1')).toBe(false);
    expect(client.getQueryData(['profile', 'u1'])).toBeUndefined();
    expect(client.getQueryData(['targets', 'u1'])).toBeUndefined();
  });

  it('keeps the cache for a token refresh', async () => {
    const client = new QueryClient();
    gateCache.update('u1', { onboardingCompleted: true });
    await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('signed-in')).toBeOnTheScreen());
    mockState.callback?.('TOKEN_REFRESHED', mockSession);
    expect(gateCache.read('u1')?.onboardingCompleted).toBe(true);
  });
});
