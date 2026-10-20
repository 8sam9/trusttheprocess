import { space } from '@ttp/ui';
import { View } from 'react-native';
import {
  BreakdownRow,
  Card,
  FadeRise,
  MacroTrio,
  Notice,
  Tag,
  Text,
  type Macros,
} from '@/components/ui';
import { formatInt } from '@/lib/format';
import { copy } from '../copy';
import type { PlanModel } from '../derive';

export function planMacros(plan: PlanModel): Macros {
  return { proteinG: plan.final.proteinG, carbsG: plan.final.carbsG, fatG: plan.final.fatG };
}

/** "DAILY TARGET 1,330 KCAL A DAY" with the macro trio and the CUSTOM / SAFETY MINIMUM tags. */
export function TargetCard({ plan }: { plan: PlanModel }) {
  return (
    <Card>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: space.xs,
        }}
      >
        <Text variant="label" tone="muted">
          {copy.dailyTarget}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          {plan.isCustom ? <Tag label={copy.tagCustom} /> : null}
          {plan.breakdown.floorApplied ? <Tag label={copy.tagFloor} /> : null}
        </View>
      </View>
      <View
        accessible
        accessibilityLabel={`Daily target, ${formatInt(plan.final.kcal)} kcal a day`}
        style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space.xs }}
      >
        <Text variant="numberXL" tone="accent">
          {formatInt(plan.final.kcal)}
        </Text>
        <Text variant="label" tone="muted">
          {copy.kcalADay}
        </Text>
      </View>
      <MacroTrio macros={planMacros(plan)} />
    </Card>
  );
}

/** "HOW WE GOT HERE": the rows of the maths panel. */
export function MathsCard({ plan }: { plan: PlanModel }) {
  return (
    <Card>
      <Text variant="label" tone="muted">
        {copy.mathsTitle}
      </Text>
      {plan.rows.map((row) => (
        <BreakdownRow
          key={row.key}
          label={row.label}
          value={row.value}
          {...(row.sub ? { sub: row.sub } : {})}
          {...(row.signed ? { signed: true } : {})}
          {...(row.total ? { total: true } : {})}
        />
      ))}
    </Card>
  );
}

/** The body of the reveal (S6), in reading order: eyebrow, headline, target, floor note, maths, notes. */
export function PlanBody({ plan }: { plan: PlanModel }) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="muted">
          {plan.eyebrow}
        </Text>
        <Text variant="display">{copy.gameplanTitle}</Text>
      </View>
      <FadeRise>
        <TargetCard plan={plan} />
      </FadeRise>
      {plan.floorNotice ? <Notice>{plan.floorNotice}</Notice> : null}
      <FadeRise index={1}>
        <MathsCard plan={plan} />
      </FadeRise>
      <Text variant="bodyRegular" tone="muted">
        {copy.estimateNote}
      </Text>
      <Text variant="small" tone="muted">
        {copy.notMedical}
      </Text>
    </View>
  );
}
