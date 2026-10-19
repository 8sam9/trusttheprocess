import { palette, type Colors } from '@ttp/ui';
import { useColorScheme } from 'react-native';

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}
