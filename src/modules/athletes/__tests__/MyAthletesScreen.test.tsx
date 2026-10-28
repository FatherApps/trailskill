import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, ThemeProvider } from '../../../core/theme';
import { MyAthletesScreen, type MyAthleteCard, type MyAthletesView } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const paula: MyAthleteCard = { id: 'a0', name: 'Paula G.', firstName: 'Paula', lastName: 'Gómez', color: 'athlete-1', category: 'Máster', authorized: true, isSelf: true };
const tomas: MyAthleteCard = {
  id: 'a1',
  name: 'Tomás R.',
  firstName: 'Tomás',
  lastName: 'Rojas',
  color: 'athlete-2',
  school: 'Delfines',
  group: 'Grupo B',
  category: 'Infantil A',
  authorized: false,
};
const lucia: MyAthleteCard = {
  id: 'a2',
  name: 'Lucía R.',
  firstName: 'Lucía',
  lastName: 'Ramírez',
  color: 'athlete-3',
  school: 'Delfines',
  group: 'Grupo B',
  category: 'Infantil B',
  authorized: true,
};
const mateo: MyAthleteCard = { id: 'a3', name: 'Mateo C.', firstName: 'Mateo', lastName: 'Castro', color: 'athlete-4' };

const stack = (...athletes: MyAthleteCard[]): MyAthletesView => ({ kind: 'data', athletes });

const show = (view: MyAthletesView, { onOpen = jest.fn(), onAdd = jest.fn() } = {}) =>
  render(
    <ThemeProvider>
      <MyAthletesScreen view={view} onOpen={onOpen} onAdd={onAdd} scrollEnabled={false} />
    </ThemeProvider>,
  );

// The Historial button belongs to the card at the front: its hint names the athlete.
const historial = () => screen.getByRole('button', { name: 'Historial' });

describe('MyAthletesScreen', () => {
  it('brings the first athlete to the front, with the others collapsed above it in order', async () => {
    await show(stack(paula, tomas, lucia));

    expect(historial().props.accessibilityHint).toBe('Abre el perfil de Paula G.');
    const collapsed = screen.getAllByRole('button', { name: /^(Tomás R\.|Lucía R\.)/ });
    expect(collapsed.map((card) => card.props.accessibilityLabel)).toEqual(['Tomás R., Infantil A', 'Lucía R., Infantil B']);
  });

  it('shows on the front card the school and group, the category in capitals, the full name and the tag', async () => {
    await show(stack(tomas, lucia));

    expect(screen.getByText('Delfines · Grupo B')).toBeOnTheScreen();
    expect(screen.getByText('INFANTIL A')).toBeOnTheScreen();
    expect(screen.getByText('Tomás\nRojas')).toBeOnTheScreen();
    expect(screen.getByRole('text', { name: 'Autorización pendiente' })).toBeOnTheScreen();
  });

  it('shows on a collapsed card only the short name and the category', async () => {
    await show(stack(tomas, lucia));

    expect(screen.getByText('Lucía R.')).toBeOnTheScreen();
    expect(screen.getByText('Infantil B')).toBeOnTheScreen();
    // Nothing of a collapsed card but its two texts: no second school line, no tag, no button.
    expect(screen.getAllByText('Delfines · Grupo B')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Historial' })).toHaveLength(1);
  });

  it('brings a collapsed card to the front when it is pressed, keeping the order of the others', async () => {
    await show(stack(paula, tomas, lucia));

    await fireEvent.press(screen.getByRole('button', { name: 'Lucía R., Infantil B' }));

    expect(historial().props.accessibilityHint).toBe('Abre el perfil de Lucía R.');
    expect(screen.getByText('Lucía\nRamírez')).toBeOnTheScreen();
    const collapsed = screen.getAllByRole('button', { name: /Paula G\.|Tomás R\./ });
    expect(collapsed.map((card) => card.props.accessibilityLabel)).toEqual(['Paula G. · tú, Máster', 'Tomás R., Infantil A']);
  });

  it('labels the card of the adult themselves with "tú"', async () => {
    await show(stack(paula, tomas));

    expect(screen.getByText('Tomás R.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tomás R., Infantil A' }));
    expect(screen.getByText('Paula G. · tú')).toBeOnTheScreen();
    expect(screen.queryByText('Tomás R. · tú')).toBeNull();
  });

  it('opens the profile of the athlete at the front when "Historial" is pressed', async () => {
    const onOpen = jest.fn();
    await show(stack(paula, tomas, lucia), { onOpen });

    await fireEvent.press(screen.getByRole('button', { name: 'Tomás R., Infantil A' }));
    await fireEvent.press(historial());

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('a1');
  });

  it('tags the front athlete as authorized, as pending, or with no tag while the state is unknown', async () => {
    await show(stack(lucia, tomas, mateo));

    expect(screen.getByRole('text', { name: 'Autorizado' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tomás R., Infantil A' }));
    expect(screen.getByRole('text', { name: 'Autorización pendiente' })).toBeOnTheScreen();
    expect(screen.queryByRole('text', { name: 'Autorizado' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Mateo C.' }));
    expect(screen.queryByRole('text', { name: /Autoriz/ })).toBeNull();
  });

  it('leaves out the lines of an athlete the device knows nothing about', async () => {
    await show(stack(mateo));

    expect(screen.getByText('Mateo\nCastro')).toBeOnTheScreen();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('shows the school alone, or the group alone, when only one of them is known', async () => {
    await show(stack({ ...tomas, group: undefined }));
    expect(screen.getByText('Delfines')).toBeOnTheScreen();
  });

  it('paints each card with the colour of its athlete', async () => {
    await show(stack(tomas, lucia));

    const front = screen.getByText('Tomás\nRojas').parent!;
    expect(StyleSheet.flatten(front.props.style).backgroundColor).toBe(colors.light['athlete-2']);
    const collapsed = screen.getByRole('button', { name: 'Lucía R., Infantil B' }).children[0] as unknown as { props: { style: never } };
    expect(StyleSheet.flatten(collapsed.props.style).backgroundColor).toBe(colors.light['athlete-3']);
  });

  it('draws the decorative ring on the front card only', async () => {
    await show(stack(tomas, lucia));

    // The decoration is hidden from screen readers, so the query must ask for hidden elements too.
    expect(screen.getAllByTestId('color-card-ring', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('sits on the background of the screens', async () => {
    const { toJSON } = await show(stack(tomas));

    expect(StyleSheet.flatten((toJSON() as unknown as { props: { style: never } }).props.style).backgroundColor).toBe(colors.light['surface-0']);
  });

  it('asks to add an athlete when "Agregar deportista" is pressed', async () => {
    const onAdd = jest.fn();
    await show(stack(tomas), { onAdd });

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
