import { fireEvent, render, screen } from '@testing-library/react-native';

import { SettingsSwitchRow } from '../components/SettingsSwitchRow';

describe('SettingsSwitchRow', () => {
  it('is one switch named by the setting, with its explanation, and reports the opposite value', async () => {
    const onChange = jest.fn();
    await render(<SettingsSwitchRow icon="videocam" label="Grabar con audio" hint="Sin audio no se pide el micrófono." value onChange={onChange} />);
    const row = screen.getByRole('switch', { name: 'Grabar con audio' });
    expect(row.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText('Sin audio no se pide el micrófono.')).toBeTruthy();
    await fireEvent.press(row);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('turns on from off', async () => {
    const onChange = jest.fn();
    await render(<SettingsSwitchRow icon="timer" label="Mostrar el cronómetro" hint="Explicación." value={false} onChange={onChange} />);
    const row = screen.getByRole('switch', { name: 'Mostrar el cronómetro' });
    expect(row.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(row);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
