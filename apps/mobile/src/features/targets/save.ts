import { ApplyTargetsArgs, buildApplyTargetsArgs } from '@ttp/shared';
import type { PlanModel } from './derive';

/** Builds the apply_targets arguments for a plan. Validation happens in useApplyTargets (ApplyTargetsArgs.safeParse). */
export function argsForPlan(
  plan: PlanModel,
  opts: { timezone: string; giveConsent: boolean },
): ApplyTargetsArgs {
  return buildApplyTargetsArgs({
    input: plan.input,
    goalOption: plan.goalOption,
    timezone: opts.timezone,
    giveConsent: opts.giveConsent,
    breakdown: plan.breakdown,
    final: plan.final,
  });
}

export function durationBucket(ms: number): 'lt_1m' | '1_to_3m' | 'gt_3m' {
  return ms < 60_000 ? 'lt_1m' : ms < 180_000 ? '1_to_3m' : 'gt_3m';
}
