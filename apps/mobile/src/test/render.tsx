import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** The user, set up for fake timers (renderRouter switches jest to fake timers). */
export const setupUser = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });

export function newQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
}

/** Renders the real signed-in route tree (src/app/(app)) at `initialUrl` with a fresh query client. */
export async function renderApp(initialUrl = '/', client: QueryClient = newQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
    </QueryClientProvider>
  );
  const result = await renderRouter('src/app/(app)', { initialUrl, wrapper });
  // Wait for the gate to decide (S0 loading) so tests start on the screen the user would see.
  await waitFor(() => expect(screen.queryByLabelText('Loading your plan')).toBeNull());
  return { ...result, client };
}
