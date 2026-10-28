import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, ThemeProvider } from '../../../core/theme';
import { MyAthletesScreen, type MyAthletesView } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const data: MyAthletesView = {
  kind: 'data',
  athletes: [
    { id: 'a1', name: 'Tomás R.', color: 'athlete-2', school: 'Delfines', group: 'Grupo B', category: 'Infantil A', authorized: true },
    { id: 'a2', name: 'Lucía R.', color: 'athlete-4', authorized: false },
    { id: 'a3', name: 'Mateo C.', color: 'athlete-1' },
  ],
};

const show = (view: MyAthletesView, { onOpen = jest.fn(), onAdd = jest.fn() } = {}) =>
  render(
    <ThemeProvider>
      <MyAthletesScreen view={view} onOpen={onOpen} onAdd={onAdd} scrollEnabled={false} />
    </ThemeProvider>,
  );

describe('MyAthletesScreen', () => {
  it('shows the title and, on each card, the school and group, the category and the name', async () => {
    await show(data);

    expect(screen.getByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
    expect(screen.getByText('Tomás R.')).toBeOnTheScreen();
    expect(screen.getByText('Delfines · Grupo B')).toBeOnTheScreen();
    expect(screen.getByText('Infantil A')).toBeOnTheScreen();
    expect(screen.getByText('Lucía R.')).toBeOnTheScreen();
  });

  it('leaves out the school, group and category lines of an athlete the device knows nothing about', async () => {
    await show({ kind: 'data', athletes: [{ id: 'a3', name: 'Mateo C.', color: 'athlete-1' }] });

    expect(screen.getByText('Mateo C.')).toBeOnTheScreen();
    // Only the name and the history button: no school, group or category line.
    expect(screen.getByText('Mateo C.').parent!.children).toHaveLength(2);
  });

  it('shows the school alone, or the group alone, when only one of them is known', async () => {
    await show({
      kind: 'data',
      athletes: [
        { id: 'a1', name: 'Tomás R.', color: 'athlete-2', school: 'Delfines' },
        { id: 'a2', name: 'Lucía R.', color: 'athlete-4', group: 'Grupo B' },
      ],
    });

    expect(screen.getByText('Delfines')).toBeOnTheScreen();
    expect(screen.getByText('Grupo B')).toBeOnTheScreen();
  });

  it('paints each card with the colour of its athlete', async () => {
    await show(data);

    const card = screen.getByText('Tomás R.').parent!;
    expect(StyleSheet.flatten(card.props.style).backgroundColor).toBe(colors.light['athlete-2']);
  });

  it('tags an athlete with a valid authorization as authorized', async () => {
    await show(data);

    expect(screen.getAllByRole('text', { name: 'Autorizado' })).toHaveLength(1);
  });

  it('tags an athlete without a valid authorization as pending, and an unknown state with no tag', async () => {
    await show(data);

    expect(screen.getAllByRole('text', { name: 'Autorización pendiente' })).toHaveLength(1);
    // Mateo C.: neither tag, the card only has its name and the history button.
    expect(screen.getByText('Mateo C.').parent!.children).toHaveLength(2);
  });

  it('opens the profile of the athlete whose "Historial" button is pressed', async () => {
    const onOpen = jest.fn();
    await show(data, { onOpen });

    await fireEvent.press(screen.getAllByRole('button', { name: 'Historial' })[1]!);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('a2');
  });

  it('tells a screen reader whose history each "Historial" button opens', async () => {
    await show(data);

    const [first] = screen.getAllByRole('button', { name: 'Historial' });
    expect(first!.props.accessibilityHint).toBe('Abre el perfil de Tomás R.');
  });

  it('asks to add an athlete when "Agregar deportista" is pressed', async () => {
    const onAdd = jest.fn();
    await show(data, { onAdd });

    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['empty', { kind: 'empty' } as MyAthletesView],
    ['loading', { kind: 'loading' } as MyAthletesView],
  ])('offers "Agregar deportista" also when the screen is %s', async (_state, view) => {
    const onAdd = jest.fn();
    await show(view, { onAdd });

    await fireEvent.press(screen.getByRole('button', { name: 'Agregar deportista' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state in es-CO when there are no athletes', async () => {
    await show({ kind: 'empty' });

    expect(screen.getByText('Aún no hay deportistas')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Historial' })).toBeNull();
  });

  it('shows no card while loading', async () => {
    await show({ kind: 'loading' });

    expect(screen.queryByRole('button', { name: 'Historial' })).toBeNull();
    expect(screen.queryByText('Aún no hay deportistas')).toBeNull();
  });
});
