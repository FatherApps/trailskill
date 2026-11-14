import { fireEvent, render, screen } from '@testing-library/react-native';

import { SettingsScreen } from '../screens/SettingsScreen';

async function setup(overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  const props = {
    themeMode: 'system' as const,
    timePrecision: 'hundredths' as const,
    onThemeModeChange: jest.fn(),
    onTimePrecisionChange: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  };
  await render(<SettingsScreen {...props} />);
  return props;
}

describe('SettingsScreen', () => {
  it('offers the four themes and the two precisions', async () => {
    await setup();
    for (const label of ['Sistema', 'Claro', 'Oscuro', 'Sol', 'Centésimas', 'Milésimas']) expect(screen.getByText(label)).toBeTruthy();
  });

  it('reports the chosen theme and precision', async () => {
    const props = await setup();
    await fireEvent.press(screen.getByText('Sol'));
    await fireEvent.press(screen.getByText('Milésimas'));
    expect(props.onThemeModeChange).toHaveBeenCalledWith('sun');
    expect(props.onTimePrecisionChange).toHaveBeenCalledWith('thousandths');
  });

  it('shows the example time in the chosen precision', async () => {
    await setup({ timePrecision: 'thousandths' });
    expect(screen.getByText('Ejemplo: 1:05,372')).toBeTruthy();
  });

  it('goes back', async () => {
    const props = await setup();
    await fireEvent.press(screen.getByLabelText('Volver'));
    expect(props.onBack).toHaveBeenCalled();
  });
});
