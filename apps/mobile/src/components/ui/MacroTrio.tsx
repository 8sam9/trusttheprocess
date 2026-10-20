import { space } from '@ttp/ui';
import { View } from 'react-native';
import { useLargeText } from '@/lib/a11y';
import { formatInt } from '@/lib/format';
import { useDataColors } from '@/lib/theme';
import { Text } from './Text';

export interface Macros {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Protein, carbs and fat as three equal columns, each with a 3 pt rule in its data colour, a value and a word
 * label (colour is never the only signal). Stacks into rows at large text. `previous` shows "104 → 110 g".
 */
export function MacroTrio({
  macros,
  previous,
  compact,
}: {
  macros: Macros;
  previous?: Macros;
  compact?: boolean;
}) {
  const d = useDataColors();
  const large = useLargeText();

  if (compact) {
    return (
      <Text
        variant="number"
        accessibilityLabel={`Protein ${macros.proteinG} grams, carbs ${macros.carbsG} grams, fat ${macros.fatG} grams`}
      >
        {`P ${macros.proteinG} g · C ${macros.carbsG} g · F ${macros.fatG} g`}
      </Text>
    );
  }

  const cols = [
    {
      key: 'protein',
      label: 'PROTEIN',
      spoken: 'Protein',
      now: macros.proteinG,
      was: previous?.proteinG,
      color: d.protein,
    },
    {
      key: 'carbs',
      label: 'CARBS',
      spoken: 'Carbs',
      now: macros.carbsG,
      was: previous?.carbsG,
      color: d.carbs,
    },
    {
      key: 'fat',
      label: 'FAT',
      spoken: 'Fat',
      now: macros.fatG,
      was: previous?.fatG,
      color: d.fat,
    },
  ];
  return (
    <View style={{ flexDirection: large ? 'column' : 'row', gap: space.sm }}>
      {cols.map((col) => {
        const value =
          col.was !== undefined && col.was !== col.now
            ? `${formatInt(col.was)} → ${formatInt(col.now)} g`
            : `${formatInt(col.now)} g`;
        const spoken =
          col.was !== undefined && col.was !== col.now
            ? `${col.spoken}, was ${col.was} grams, now ${col.now} grams`
            : `${col.spoken}, ${col.now} grams`;
        return (
          <View
            key={col.key}
            accessible
            accessibilityLabel={spoken}
            style={{
              flex: large ? undefined : 1,
              flexDirection: large ? 'row' : 'column',
              gap: large ? space.sm : space.xxs,
              alignItems: large ? 'center' : 'stretch',
            }}
          >
            <View
              style={{
                backgroundColor: col.color,
                ...(large ? { width: 3, alignSelf: 'stretch' } : { height: 3 }),
              }}
            />
            <View style={{ gap: 0, flexDirection: large ? 'row' : 'column', flexWrap: 'wrap' }}>
              <Text variant="number" style={large ? { marginRight: space.xs } : undefined}>
                {value}
              </Text>
              <Text variant="label" tone="muted">
                {col.label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
