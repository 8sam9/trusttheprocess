import type { AnalyticsEvent } from '@ttp/shared';
import { setAnalyticsSink } from '@/lib/analytics';

/** Every analytics event emitted during the current test, in order. */
export const events: AnalyticsEvent[] = [];

export const eventsNamed = <N extends AnalyticsEvent['name']>(name: N) =>
  events.filter((e): e is Extract<AnalyticsEvent, { name: N }> => e.name === name);

beforeEach(() => {
  events.length = 0;
  setAnalyticsSink((e) => events.push(e));
});
