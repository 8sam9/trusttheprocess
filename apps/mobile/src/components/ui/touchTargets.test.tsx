import { render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import type React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { minTouch } from '@ttp/ui';
import { Choice, ListRow, RadioCard, Sheet, Stepper } from '.';

// QA (spec 001, AC 31): every touch target is at least 44 pt and RadioCards at least 64 pt.
// Layout is not rendered under jest, so these assert the declared sizes.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const withSafeArea = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>
);
const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as never) as {
    minHeight?: number;
    height?: number;
    width?: number;
  };

describe('touch targets (AC 31)', () => {
  it('minTouch is 44', () => {
    expect(minTouch).toBeGreaterThanOrEqual(44);
  });

  it('Choice chips are at least 44 pt tall', async () => {
    await render(
      <Choice
        label="Sex"
        value="female"
        options={[
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
          { value: 'na', label: 'Prefer not to say' },
        ]}
        onChange={jest.fn()}
      />,
    );
    for (const radio of screen.getAllByRole('radio')) {
      expect(flat(radio).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('RadioCards are at least 64 pt tall, including the unavailable state', async () => {
    await render(
      <>
        <RadioCard title="LOSE FAT" description="d" selected={false} onPress={jest.fn()} />
        <RadioCard
          title="BUILD MUSCLE"
          description="d"
          selected={false}
          unavailable
          tag="NOT AVAILABLE"
          onPress={jest.fn()}
        />
      </>,
    );
    for (const radio of screen.getAllByRole('radio')) {
      expect(flat(radio).minHeight).toBeGreaterThanOrEqual(64);
    }
  });

  it('Stepper and ListRow controls are at least 44 pt', async () => {
    function Harness() {
      const [v, setV] = useState(1330);
      return (
        <>
          <Stepper
            value={v}
            min={1200}
            max={6000}
            step={50}
            label="Daily calories"
            onChange={setV}
          />
          <ListRow label="Goal" value="Lose fat" onPress={jest.fn()} />
        </>
      );
    }
    await render(<Harness />);
    for (const name of ['Increase by 50', 'Decrease by 50']) {
      const s = flat(screen.getByRole('button', { name }));
      expect(s.height).toBeGreaterThanOrEqual(44);
      expect(s.width).toBeGreaterThanOrEqual(44);
    }
    expect(flat(screen.getByRole('button', { name: /Goal/ })).minHeight).toBeGreaterThanOrEqual(56);
  });

  it('Sheet Close and Back are at least 44 pt', async () => {
    await render(
      withSafeArea(
        <Sheet visible title="GOAL" onClose={jest.fn()} onBack={jest.fn()}>
          <RNText>page</RNText>
        </Sheet>,
      ),
    );
    for (const name of ['Close', 'Back']) {
      const s = flat(screen.getByRole('button', { name }));
      expect(s.height).toBeGreaterThanOrEqual(44);
      expect(s.width).toBeGreaterThanOrEqual(44);
    }
  });
});

// Known defect found by QA in a real browser (spec 001 QA report, bug 2). On web (react-native-web 0.21)
// `accessibilityState={{ checked }}` is dropped, so no radio exposes aria-checked and the selected state is not
// available to screen readers (WCAG 4.1.2). `it.failing` keeps the suite green and flips to a failure once the
// component passes `aria-checked` (or `role` + `aria-checked`) so the marker can be removed.
describe('web radio state (known defect)', () => {
  it.failing('Choice and RadioCard expose aria-checked for react-native-web', async () => {
    await render(
      <>
        <Choice
          label="Units"
          value="metric"
          options={[
            { value: 'metric', label: 'Metric' },
            { value: 'imperial', label: 'Imperial' },
          ]}
          onChange={jest.fn()}
        />
        <RadioCard title="LOSE FAT" description="d" selected onPress={jest.fn()} />
      </>,
    );
    expect(screen.getByRole('radio', { name: 'Metric' }).props['aria-checked']).toBe(true);
    expect(screen.getByRole('radio', { name: /Lose fat/ }).props['aria-checked']).toBe(true);
  });
});
