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
    { id: 'a1', name: 'Tomás R.', color: 'athlete-2', detail: 'Infantil A · Grupo B' },
    { id: 'a2', name: 'Lucía R.', color: 'athlete-4' },
  ],
};

const show = (view: MyAthletesView, onOpen = jest.fn()) =>
  render(
    <ThemeProvider>
      <MyAthletesScreen view={view} onOpen={onOpen} scrollEnabled={false} />
    </ThemeProvider>,
  );

describe('MyAthletesScreen', () => {
  it('shows the title and one card per athlete with its category and group', async () => {
    await show(data);

    expect(screen.getByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
    expect(screen.getByText('Tomás R.')).toBeOnTheScreen();
    expect(screen.getByText('Infantil A · Grupo B')).toBeOnTheScreen();
    expect(screen.getByText('Lucía R.')).toBeOnTheScreen();
  });

  it('paints each card with the colour of its athlete', async () => {
    await show(data);

    const card = screen.getByText('Tomás R.').parent!;
    expect(StyleSheet.flatten(card.props.style).backgroundColor).toBe(colors.light['athlete-2']);
  });

  it('opens the athlete when its card is pressed', async () => {
    const onOpen = jest.fn();
    await show(data, onOpen);

    await fireEvent.press(screen.getByRole('button', { name: 'Tomás R., Infantil A · Grupo B' }));

    expect(onOpen).toHaveBeenCalledWith('a1');
  });

  it('announces the name and the detail together, and only the name when there is no detail', async () => {
    await show(data);

    const [withDetail, withoutDetail] = screen.getAllByRole('button');
    expect(withDetail.props.accessibilityLabel).toBe('Tomás R., Infantil A · Grupo B');
    expect(withDetail.props.accessibilityValue?.text).toBeUndefined();
    expect(withoutDetail.props.accessibilityLabel).toBe('Lucía R.');
    expect(withoutDetail.props.accessibilityValue?.text).toBeUndefined();
  });

  it('shows an empty state in es-CO when there are no athletes', async () => {
    await show({ kind: 'empty' });

    expect(screen.getByText('Aún no hay deportistas')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows no card while loading', async () => {
    await show({ kind: 'loading' });

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Aún no hay deportistas')).toBeNull();
  });
});
