import { getLocales } from 'expo-localization';

/** The next call of getLocales reports this region (the default test device is Italian). */
export function mockRegionOnce(regionCode: string): void {
  jest
    .mocked(getLocales)
    .mockReturnValueOnce([{ regionCode } as unknown as ReturnType<typeof getLocales>[number]]);
}
