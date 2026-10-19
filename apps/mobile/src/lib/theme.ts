import { dataColors, palette, type Colors } from '@ttp/ui';
import { useColorScheme } from 'react-native';

/** Track Day is dark-first: dark unless the device explicitly asks for light. */
export function useScheme(): 'dark' | 'light' {
  return useColorScheme() === 'light' ? 'light' : 'dark';
}

export function useColors(): Colors {
  return palette[useScheme()];
}

export function useDataColors() {
  return dataColors[useScheme()];
}
