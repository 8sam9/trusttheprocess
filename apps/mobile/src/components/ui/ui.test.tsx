import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import type React from 'react';
import { Dimensions, Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  BreakdownRow,
  Button,
  Choice,
  LaneBar,
  ListRow,
  MacroTrio,
  Notice,
  RadioCard,
  Sheet,
  StepHeader,
  Stepper,
  Tag,
  TaskScreen,
  Text,
  TextField,
} from '.';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const withSafeArea = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>
);

describe('Button', () => {
  it('calls onPress and exposes an accessible label', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} />);
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is busy and ignores presses while loading, announcing the busy label', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <Button label="LET'S GO" busyLabel="Saving your plan" loading onPress={onPress} />,
    );
    const button = screen.getByRole('button', { name: 'Saving your plan' });
    expect(button).toBeBusy();
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders the text variant and the equal-size secondary', async () => {
    await render(
      <>
        <Button label="Adjust targets" variant="text" onPress={jest.fn()} />
        <Button label="NO THANKS" variant="secondary" size="cta" onPress={jest.fn()} />
        <Button label="I AGREE" onPress={jest.fn()} />
      </>,
    );
    const style = (name: string) => {
      const flat = screen.getByRole('button', { name }).props.style;
      return typeof flat === 'function' ? flat({ pressed: false }) : flat;
    };
    expect(style('NO THANKS').minHeight).toBe(56);
    expect(style('I AGREE').minHeight).toBe(56);
    expect(style('Adjust targets').minHeight).toBeGreaterThanOrEqual(44);
  });
});

describe('Choice', () => {
  it('exposes checked (not selected) and reports changes', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(
      <Choice
        label="Units"
        value="metric"
        options={[
          { value: 'metric', label: 'Metric' },
          { value: 'imperial', label: 'Imperial' },
        ]}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('Units').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Metric' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Imperial' })).not.toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Imperial' }));
    expect(onChange).toHaveBeenCalledWith('imperial');
  });
});

describe('RadioCard', () => {
  it('is a radio with a spoken title and description, checked when selected', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(
      <>
        <RadioCard
          title="LOSE FAT"
          description="Steady deficit, protein kept high"
          selected
          onPress={onPress}
        />
        <RadioCard
          title="BUILD MUSCLE"
          description="Small surplus"
          selected={false}
          onPress={onPress}
        />
      </>,
    );
    const lose = screen.getByRole('radio', {
      name: 'Lose fat. Steady deficit, protein kept high.',
    });
    expect(lose).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Build muscle. Small surplus.' })).not.toBeChecked();
    await user.press(lose);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows an unavailable card as disabled with its tag and does not respond', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(
      <RadioCard
        title="LOSE FAT"
        tag="NOT AVAILABLE"
        unavailable
        selected={false}
        accessibilityLabel="Lose fat, unavailable. See note above."
        onPress={onPress}
      />,
    );
    const card = screen.getByRole('radio', { name: 'Lose fat, unavailable. See note above.' });
    expect(card).toBeDisabled();
    expect(screen.getByText('NOT AVAILABLE')).toBeOnTheScreen();
    await user.press(card);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reveals its children only when selected', async () => {
    const { rerender } = await render(
      <RadioCard title="CUSTOM" selected={false} onPress={jest.fn()}>
        <RNText>input</RNText>
      </RadioCard>,
    );
    expect(screen.queryByText('input')).toBeNull();
    await rerender(
      <RadioCard title="CUSTOM" selected onPress={jest.fn()}>
        <RNText>input</RNText>
      </RadioCard>,
    );
    expect(screen.getByText('input')).toBeOnTheScreen();
  });

  it('turns the outline amber in the warning tone', async () => {
    await render(<RadioCard title="CUSTOM" selected tone="warning" onPress={jest.fn()} />);
    const radio = screen.getByRole('radio');
    const container = radio.parent;
    expect(container?.props.style.borderColor).toBe('#FFB020');
  });
});

describe('LaneBar and StepHeader', () => {
  it('exposes progress to screen readers, clamped to 0 to 100', async () => {
    await render(<LaneBar value={1.4} label="Calories eaten" />);
    const bar = screen.getByRole('progressbar', { name: 'Calories eaten' });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
  });

  it('speaks valueText instead of a percentage', async () => {
    await render(<LaneBar value={0.4} label="Progress" valueText="Step 2 of 5" />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.text).toBe('Step 2 of 5');
  });

  it('StepHeader reads "Step 2 of 5" as one progress element and shows STEP 2 OF 5', async () => {
    await render(<StepHeader step={2} />);
    const bar = screen.getByRole('progressbar', { name: 'Step 2 of 5' });
    expect(bar.props.accessibilityValue).toEqual({ min: 1, max: 5, now: 2, text: 'Step 2 of 5' });
    expect(screen.getByText('STEP 2 OF 5')).toBeOnTheScreen();
  });
});

describe('Text', () => {
  it('marks display and title variants as headers', async () => {
    await render(<Text variant="display">Today</Text>);
    expect(screen.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
  });
});

describe('TextField', () => {
  it('links the error to the field and announces it politely', async () => {
    await render(<TextField label="Height (cm)" error="That height looks off." />);
    const input = screen.getByLabelText('Height (cm)');
    expect(input.props.accessibilityHint).toBe('That height looks off.');
    expect(screen.getByText('That height looks off.').props.accessibilityLiveRegion).toBe('polite');
  });

  it('can speak a longer label than it shows', async () => {
    await render(<TextField label="kg a week" accessibilityLabel="Custom pace in kg a week" />);
    expect(screen.getByLabelText('Custom pace in kg a week')).toBeOnTheScreen();
    expect(screen.getByText('kg a week')).toBeOnTheScreen();
  });
});

describe('Notice', () => {
  it('announces politely when live, and danger notices are alerts', async () => {
    await render(
      <>
        <Notice live>Info text</Notice>
        <Notice tone="danger" live>
          Could not save
        </Notice>
        <Notice tone="danger" action={{ label: 'Try again', onPress: jest.fn() }}>
          With action
        </Notice>
      </>,
    );
    expect(screen.getByText('Info text').parent?.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    // A notice with an action keeps the button reachable on its own.
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('is silent by default', async () => {
    await render(<Notice>Plain</Notice>);
    expect(screen.getByText('Plain').parent?.props.accessibilityLiveRegion).toBeUndefined();
  });
});

describe('Tag, MacroTrio, BreakdownRow, ListRow', () => {
  it('Tag shows its label', async () => {
    await render(<Tag label="SAFETY MINIMUM" />);
    expect(screen.getByText('SAFETY MINIMUM')).toBeOnTheScreen();
  });

  it('MacroTrio pairs every value with a word label and reads each as one element', async () => {
    await render(<MacroTrio macros={{ proteinG: 104, carbsG: 129, fatG: 44 }} />);
    expect(screen.getByLabelText('Protein, 104 grams')).toBeOnTheScreen();
    expect(screen.getByLabelText('Carbs, 129 grams')).toBeOnTheScreen();
    expect(screen.getByLabelText('Fat, 44 grams')).toBeOnTheScreen();
    expect(screen.getByText('PROTEIN')).toBeOnTheScreen();
    expect(screen.getByText('104 g')).toBeOnTheScreen();
  });

  it('MacroTrio shows old to new', async () => {
    await render(
      <MacroTrio
        macros={{ proteinG: 110, carbsG: 129, fatG: 44 }}
        previous={{ proteinG: 104, carbsG: 129, fatG: 44 }}
      />,
    );
    expect(screen.getByText('104 → 110 g')).toBeOnTheScreen();
    expect(screen.getByLabelText('Protein, was 104 grams, now 110 grams')).toBeOnTheScreen();
  });

  it('BreakdownRow reads signs as words', async () => {
    await render(
      <>
        <BreakdownRow label="Deficit for your pace" value={-550} signed />
        <BreakdownRow label="Lean-gain surplus" value={275} signed />
        <BreakdownRow
          label="Daily target"
          value={1330}
          total
          sub="Rounded to the nearest 10 kcal"
        />
      </>,
    );
    expect(screen.getByLabelText('Deficit for your pace, minus 550 kcal')).toBeOnTheScreen();
    expect(screen.getByText('−550')).toBeOnTheScreen();
    expect(screen.getByLabelText('Lean-gain surplus, plus 275 kcal')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Daily target, 1,330 kcal. Rounded to the nearest 10 kcal'),
    ).toBeOnTheScreen();
  });

  it('ListRow is a labelled, at-least-56pt button', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<ListRow label="Goal" value="Lose fat" onPress={onPress} />);
    const row = screen.getByRole('button', { name: 'Goal, Lose fat' });
    const style = typeof row.props.style === 'function' ? row.props.style({}) : row.props.style;
    expect(style.minHeight).toBeGreaterThanOrEqual(56);
    await user.press(row);
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Stepper', () => {
  function Harness({ initial = 1330, min = 1200 }: { initial?: number; min?: number }) {
    const [v, setV] = useState(initial);
    return (
      <Stepper
        value={v}
        min={min}
        max={6000}
        step={50}
        label={`Daily calories, ${v} kcal. Adjustable.`}
        onChange={(n) => setV(Math.max(min, Math.min(6000, n)))}
      />
    );
  }

  it('is adjustable with increment and decrement actions', async () => {
    await render(<Harness />);
    const field = screen.getByRole('adjustable', {
      name: 'Daily calories, 1330 kcal. Adjustable.',
    });
    expect(field.props.accessibilityActions.map((a: { label: string }) => a.label)).toEqual([
      'Increase by 50',
      'Decrease by 50',
    ]);
  });

  it('steps by 50 with labelled buttons', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Increase by 50' }));
    expect(screen.getByRole('adjustable')).toHaveDisplayValue('1380');
    await user.press(screen.getByRole('button', { name: 'Decrease by 50' }));
    await user.press(screen.getByRole('button', { name: 'Decrease by 50' }));
    expect(screen.getByRole('adjustable')).toHaveDisplayValue('1280');
  });

  it('shows the minus button as disabled at the minimum', async () => {
    await render(<Harness initial={1200} />);
    expect(screen.getByRole('button', { name: 'Decrease by 50' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase by 50' })).toBeEnabled();
  });

  it('commits a typed value on blur', async () => {
    await render(<Harness />);
    const field = screen.getByRole('adjustable');
    await fireEvent.changeText(field, '1500');
    await fireEvent(field, 'blur');
    expect(screen.getByRole('adjustable')).toHaveDisplayValue('1500');
  });

  it('snaps a typed value below the minimum through the owner', async () => {
    await render(<Harness />);
    const field = screen.getByRole('adjustable');
    await fireEvent.changeText(field, '900');
    await fireEvent(field, 'blur');
    expect(screen.getByRole('adjustable')).toHaveDisplayValue('1200');
  });
});

describe('Sheet', () => {
  it('is a dialog with a title, a Close button and an optional Back', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await render(
      withSafeArea(
        <Sheet visible title="EDIT YOUR TARGETS" onClose={onClose}>
          <RNText>content</RNText>
        </Sheet>,
      ),
    );
    expect(screen.getByText('EDIT YOUR TARGETS')).toBeOnTheScreen();
    expect(screen.getByText('content')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding when dirty, and keeps editing on request', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await render(
      withSafeArea(
        <Sheet visible title="T" dirty onClose={onClose}>
          <RNText>content</RNText>
        </Sheet>,
      ),
    );
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard your changes?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Discard your changes?')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    await user.press(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a pushed page shows Back instead of closing', async () => {
    const onBack = jest.fn();
    const user = userEvent.setup();
    await render(
      withSafeArea(
        <Sheet visible title="GOAL" onClose={jest.fn()} onBack={onBack}>
          <RNText>page</RNText>
        </Sheet>,
      ),
    );
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('TaskScreen', () => {
  it('shows the footer actions and a tagline that screen readers skip', async () => {
    await render(
      <TaskScreen primary={<Button label="CONTINUE" onPress={jest.fn()} />}>
        <RNText>body</RNText>
      </TaskScreen>,
    );
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeOnTheScreen();
    const tagline = screen.getByText('Trust the process. Show up, log, repeat.', {
      includeHiddenElements: true,
    });
    expect(tagline.props.accessibilityElementsHidden).toBe(true);
  });

  it('reflows at large text: the footer scrolls with the content and the tagline is dropped', async () => {
    Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 2 } });
    await render(
      <TaskScreen primary={<Button label="CONTINUE" onPress={jest.fn()} />}>
        <RNText>body</RNText>
      </TaskScreen>,
    );
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeOnTheScreen();
    expect(
      screen.queryByText('Trust the process. Show up, log, repeat.', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });

  it('can omit the tagline', async () => {
    await render(
      <TaskScreen tagline={false} primary={<Button label="OK" onPress={jest.fn()} />}>
        <RNText>body</RNText>
      </TaskScreen>,
    );
    expect(
      screen.queryByText('Trust the process. Show up, log, repeat.', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });
});
