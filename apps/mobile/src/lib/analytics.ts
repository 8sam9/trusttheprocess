import { AnalyticsEvent } from '@ttp/shared';

/**
 * Analytics entry point (spec 001 section 5). Events are validated against the shared zod union, which only
 * allows enums, booleans and small integers, so a mistake can't leak a body stat, calorie value or name.
 * No analytics SDK is installed yet (spec 001 H3): the production sink is a no-op, development logs to the console
 * and tests install a spy with setAnalyticsSink.
 */
export type AnalyticsSink = (event: AnalyticsEvent) => void;

const devSink: AnalyticsSink = (event) => {
  console.debug('[analytics]', JSON.stringify(event));
};
const noopSink: AnalyticsSink = () => {};
const defaultSink = (): AnalyticsSink => (__DEV__ ? devSink : noopSink);

let sink: AnalyticsSink = defaultSink();

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next ?? defaultSink();
}

export function track(event: AnalyticsEvent): void {
  const parsed = AnalyticsEvent.safeParse(event);
  if (!parsed.success) {
    if (__DEV__) console.warn('[analytics] dropped an invalid event', event.name);
    return;
  }
  try {
    sink(parsed.data);
  } catch {
    // Analytics must never break the app.
  }
}
