import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { typography } from '../../../core/theme';
import { accountsFixture as fx } from '../__fixtures__/accounts';
import { WhoSwimsScreen, type WhoSwimsScreenProps } from '../screens/WhoSwimsScreen';

const CHILD = /^Mi hijo o hija/;
const ADULT = /^Yo,/;

async function renderScreen(props: Partial<WhoSwimsScreenProps> = {}) {
  const onSelect = jest.fn();
  const onBack = jest.fn();
  await render(<WhoSwimsScreen onSelect={onSelect} onBack={onBack} {...props} />);
  return { onSelect, onBack };
}

describe('WhoSwimsScreen', () => {
  it('initial: asks who swims with the two options, none chosen and no notice', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Crear cuenta' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '¿Quién va a nadar?' })).toBeOnTheScreen();
    expect(screen.getByText('Paso 1 de 4')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: CHILD })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: ADULT })).not.toBeChecked();
    // The row parts are hidden from screen readers: the radio label says them.
    const hidden = { includeHiddenElements: true };
    expect(screen.getByText('Soy el acudiente de un menor de 18 años', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Soy mayor de edad y nado', hidden)).toBeOnTheScreen();
    expect(screen.queryByTestId('banner')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeOnTheScreen();
  });

  it('uses the title token for the screen title, like the timing header', async () => {
    await renderScreen();

    const style = StyleSheet.flatten(screen.getByRole('header', { name: 'Crear cuenta' }).props.style);
    expect(style.fontSize).toBe(typography.title.fontSize);
    expect(style.fontFamily).toBe(typography.title.fontFamily);
    expect(style.fontSize).not.toBe(typography['title-lg'].fontSize);
  });

  it('child: explains that minors do not create their own account', async () => {
    await renderScreen({ initialChoice: 'child' });

    expect(screen.getByRole('radio', { name: CHILD })).toBeChecked();
    expect(screen.getByRole('radio', { name: ADULT })).not.toBeChecked();
    expect(screen.getByTestId('banner')).toHaveTextContent(
      'Los menores no crean su propia cuenta. Tú registras y autorizas por ellos.',
    );
    expect(screen.getByText('Paso 1 de 4')).toBeOnTheScreen();
  });

  it('adult: has one step less because the athlete details are skipped', async () => {
    await renderScreen({ initialChoice: 'adult' });

    expect(screen.getByRole('radio', { name: ADULT })).toBeChecked();
    expect(screen.getByText('Paso 1 de 3')).toBeOnTheScreen();
    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('invitation: shows the school and the group already filled in', async () => {
    await renderScreen({ invitation: fx.invitation });

    // The subtitle under the title and the emphasis inside the banner.
    expect(screen.getAllByText(fx.invitation.school, { exact: true })).toHaveLength(2);
    expect(screen.getByTestId('banner')).toHaveTextContent(
      'Te invitó Escuela Delfines al grupo Infantil B. Revisa tus datos y confirma.',
    );
  });

  it('is accessible: the two rows are radios inside one radiogroup', async () => {
    await renderScreen();

    // Not accessible itself: grouping it would hide the radios from screen readers.
    const groups = screen.container.queryAll((node) => node.props.accessibilityRole === 'radiogroup');
    expect(groups).toHaveLength(1);
    expect(groups[0].props.accessibilityLabel).toBe('¿Quién va a nadar?');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('choosing a row selects it and the other one is cleared', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('radio', { name: CHILD }));
    expect(screen.getByRole('radio', { name: CHILD })).toBeChecked();
    expect(screen.getByTestId('banner')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: ADULT }));
    expect(screen.getByRole('radio', { name: ADULT })).toBeChecked();
    expect(screen.getByRole('radio', { name: CHILD })).not.toBeChecked();
    expect(screen.queryByTestId('banner')).toBeNull();
    expect(screen.getByText('Paso 1 de 3')).toBeOnTheScreen();
  });

  it('continues with the chosen option', async () => {
    const { onSelect } = await renderScreen({ initialChoice: 'child' });
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(onSelect).toHaveBeenCalledWith('child');

    await fireEvent.press(screen.getByRole('radio', { name: ADULT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(onSelect).toHaveBeenLastCalledWith('adult');
  });

  it('continue without a choice stays enabled, says what to do and calls nothing', async () => {
    const { onSelect } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText('Elige quién va a nadar.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: CHILD }));
    expect(screen.queryByText('Elige quién va a nadar.')).toBeNull();
  });

  it('goes back', async () => {
    const { onBack } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
