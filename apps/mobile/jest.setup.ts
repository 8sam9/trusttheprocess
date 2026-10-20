// Shared jest setup. The device store behind the gate cache is replaced by an in-memory Storage, because the
// real one is expo-sqlite's localStorage (native) or the browser's (web).
jest.mock('@/lib/authStorage', () => {
  const data = new Map<string, string>();
  const storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  };
  return { authStorage: storage };
});

import '@/test/analyticsSpy';

// Tests run as an Italian device (metric) unless they override getLocales.
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ regionCode: 'IT', languageTag: 'it-IT' }]),
}));

// jest's default window has fontScale 2, which would put every screen in the large-text layout.
import { Dimensions } from 'react-native';
beforeEach(() => {
  Dimensions.set({
    window: { width: 390, height: 844, scale: 3, fontScale: 1 },
    screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
  });
});
