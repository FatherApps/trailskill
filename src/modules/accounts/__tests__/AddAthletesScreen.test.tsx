import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { colors, radius, ThemeProvider } from '../../../core/theme';
import { accountsFixture as fx } from '../__fixtures__/accounts';
import { AddAthletesScreen, type AddAthletesScreenProps } from '../screens/AddAthletesScreen';

const empty = { firstName: '', lastName: '' };

async function renderScreen(props: Partial<AddAthletesScreenProps> = {}) {
  const callbacks = { onChange: jest.fn(), onAdd: jest.fn(), onContinue: jest.fn() };
  await render(
    <AddAthletesScreen step={3} total={4} values={empty} athletes={[]} {...callbacks} {...props} />,
  );
  return callbacks;
}

// The coloured card is the nearest ancestor of the name that paints a background.
function cardOf(text: string) {
  let node = screen.getByText(text).parent;
  while (node && !StyleSheet.flatten(node.props.style)?.backgroundColor) node = node.parent;
  return StyleSheet.flatten(node!.props.style);
}

describe('AddAthletesScreen coloured cards', () => {
  it('draws each added athlete as a card in its own athlete colour with the relation as detail', async () => {
    await renderScreen({ athletes: [...fx.addedAthletes] });

    expect(cardOf('Lucía R.')).toMatchObject({ backgroundColor: colors.light['athlete-1'], borderRadius: radius.md });
    expect(cardOf('Mateo R.')).toMatchObject({ backgroundColor: colors.light['athlete-2'] });
    expect(screen.getAllByText('Hijo o hija')).toHaveLength(2);
  });

  it('shows the sync status of the profile inside its card', async () => {
    await renderScreen({
      athletes: [...fx.addedAthletes],
      renderStatus: (id) => (id === 'athlete-lucia' ? <Text>Estado de Lucía</Text> : null),
    });

    expect(screen.getByText('Estado de Lucía')).toBeOnTheScreen();
  });

  it('shows no cards while nothing is added', async () => {
    await renderScreen();

    expect(screen.queryByText('Hijo o hija')).toBeNull();
    expect(screen.getByRole('button', { name: /^Continuar/ })).toBeOnTheScreen();
  });
});

describe('AddAthletesScreen dashed add card', () => {
  it('is a dashed outlined button named for the first profile', async () => {
    await renderScreen();

    const add = screen.getByRole('button', { name: 'Agregar deportista' });
    expect(StyleSheet.flatten(add.props.style)).toMatchObject({
      borderStyle: 'dashed',
      borderWidth: 2,
      borderColor: colors.light['border-strong'],
      borderRadius: radius.md,
    });
  });

  it('is named "Agregar otro deportista" once there is a profile', async () => {
    await renderScreen({ athletes: [...fx.addedAthletes] });

    expect(screen.getByRole('button', { name: 'Agregar otro deportista' })).toBeOnTheScreen();
  });

  it('asks for both names before adding, and adds when both are typed', async () => {
    const { onAdd } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el nombre.')).toBeOnTheScreen();
    expect(screen.getByText('Escribe el apellido.')).toBeOnTheScreen();
  });

  it('adds with both names typed', async () => {
    const { onAdd } = await renderScreen({ values: { firstName: 'Lucía', lastName: 'Rojas' } });

    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('is busy and ignores presses while the profile is being saved', async () => {
    const { onAdd } = await renderScreen({ values: { firstName: 'Lucía', lastName: 'Rojas' }, busy: true });

    const add = screen.getByRole('button', { name: 'Agregar deportista' });
    expect(add).toBeBusy();
    await fireEvent.press(add);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows Continuar busy and ignores presses while a profile is being saved, instead of dropping the tap silently', async () => {
    const { onContinue } = await renderScreen({ athletes: [...fx.addedAthletes], busy: true });

    const next = screen.getByRole('button', { name: 'Continuar' });
    expect(next).toBeBusy();
    await fireEvent.press(next);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('shows the add card busy and ignores presses while Continuar keeps the step', async () => {
    const { onAdd } = await renderScreen({ values: { firstName: 'Lucía', lastName: 'Rojas' }, continuing: true });

    const add = screen.getByRole('button', { name: 'Agregar deportista' });
    expect(add).toBeBusy();
    await fireEvent.press(add);
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe('AddAthletesScreen name limit', () => {
  it('limits both names to the 100 characters the server accepts and says so', async () => {
    await renderScreen();

    expect(screen.getByLabelText('Nombre').props.maxLength).toBe(100);
    expect(screen.getByLabelText('Apellido').props.maxLength).toBe(100);
    // The line under the field is hidden from screen readers: the input announces it as its hint.
    expect(screen.getAllByText('Hasta 100 caracteres.', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getByLabelText('Nombre').props.accessibilityHint).toBe('Hasta 100 caracteres.');
  });
});

describe('AddAthletesScreen states', () => {
  it('failed add: warns that nothing was saved and keeps the typed names', async () => {
    await renderScreen({ failed: 'add', values: { firstName: 'Lucía', lastName: 'Rojas' } });

    expect(screen.getByText('No pudimos guardar el deportista. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nombre').props.value).toBe('Lucía');
  });

  it('large text: still shows the cards, the fields and the add card', async () => {
    await render(
      <ThemeProvider fontScale={2}>
        <AddAthletesScreen
          step={3}
          total={4}
          values={empty}
          athletes={[...fx.addedAthletes]}
          onChange={jest.fn()}
          onAdd={jest.fn()}
          onContinue={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Lucía R.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Agregar otro deportista' })).toBeOnTheScreen();
  });

  it('dark theme: paints the add card border with the dark token', async () => {
    await render(
      <ThemeProvider name="dark">
        <AddAthletesScreen
          step={3}
          total={4}
          values={empty}
          athletes={[]}
          onChange={jest.fn()}
          onAdd={jest.fn()}
          onContinue={jest.fn()}
        />
      </ThemeProvider>,
    );

    const add = screen.getByRole('button', { name: 'Agregar deportista' });
    expect(StyleSheet.flatten(add.props.style).borderColor).toBe(colors.dark['border-strong']);
  });
});
