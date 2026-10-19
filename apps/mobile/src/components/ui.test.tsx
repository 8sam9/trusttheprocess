import { render, screen, userEvent } from '@testing-library/react-native';
import { Button, Choice } from './ui';

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
});

describe('Choice', () => {
  it('marks the selected option and reports changes', async () => {
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
    expect(screen.getByRole('radio', { name: 'Metric' })).toBeSelected();
    await user.press(screen.getByRole('radio', { name: 'Imperial' }));
    expect(onChange).toHaveBeenCalledWith('imperial');
  });
});
