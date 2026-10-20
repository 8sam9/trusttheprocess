import type { AnalyticsEvent } from '@ttp/shared';
import { setAnalyticsSink, track } from './analytics';

describe('track (AC 32)', () => {
  it('forwards a valid event to the sink exactly once', () => {
    const sink = jest.fn();
    setAnalyticsSink(sink);
    track({ name: 'onboarding_goal_selected', goal_option: 'lose_fat' });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith({
      name: 'onboarding_goal_selected',
      goal_option: 'lose_fat',
    });
  });

  it('drops events carrying extra properties or numeric health values', () => {
    const sink = jest.fn();
    setAnalyticsSink(sink);
    track({
      name: 'targets_revealed',
      goal: 'lose',
      floor_applied: false,
      units: 'metric',
      source: 'onboarding',
      kcal: 1330,
    } as unknown as AnalyticsEvent);
    track({ name: 'onboarding_completed', duration_bucket: 'lt_1m', back_count: 12 });
    track({
      name: 'targets_manual_override',
      direction: 'up',
      value: 1500,
    } as unknown as AnalyticsEvent);
    expect(sink).not.toHaveBeenCalled();
  });

  it('never throws when the sink does', () => {
    setAnalyticsSink(() => {
      throw new Error('boom');
    });
    expect(() => track({ name: 'onboarding_started', entry: 'first_run' })).not.toThrow();
  });
});
