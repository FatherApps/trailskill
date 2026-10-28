import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle } from 'react-native';

import { colors } from '../../../core/theme';
import { IconButton } from '../../../core/ui';
import { AthleteFilters } from '../components/AthleteFilters';
import { AthleteTable } from '../components/AthleteTable';
import { ConsoleNav } from '../components/ConsoleNav';
import { athletesFixture } from '../__fixtures__/athletes';

const ring: ViewStyle = { outlineColor: colors.light.focus, outlineWidth: 2 };
type Element = ReturnType<typeof screen.getByTestId>;
const flat = (element: Element) => StyleSheet.flatten(element.props.style);

// Every control shows the focus ring while it has keyboard focus and drops it on blur.
async function expectRing(getElement: () => Element) {
  expect(flat(getElement()).outlineWidth).toBeUndefined();
  await fireEvent(getElement(), 'focus');
  expect(flat(getElement())).toMatchObject(ring);
  await fireEvent(getElement(), 'blur');
  expect(flat(getElement()).outlineWidth).toBeUndefined();
}

describe('keyboard focus ring', () => {
  it('shows on a console nav tab', async () => {
    await render(<ConsoleNav variant="side" activeId="athletes" onSelect={() => {}} schoolName="Escuela" />);
    await expectRing(() => screen.getByRole('tab', { name: 'Récords' }));
  });

  it('shows on the icon button', async () => {
    await render(<IconButton icon="close" label="Cerrar" onPress={() => {}} />);
    await expectRing(() => screen.getByRole('button', { name: 'Cerrar' }));
  });

  it('shows on an athlete table row', async () => {
    await render(<AthleteTable athletes={athletesFixture} bestLabel="MP Libre 50" onSelect={() => {}} />);
    await expectRing(() => screen.getAllByRole('button')[0]);
  });

  it('shows on a filter chip and on the search field', async () => {
    await render(<AthleteFilters query="" onQueryChange={() => {}} filters={{}} onFilterPress={() => {}} />);
    await expectRing(() => screen.getByRole('button', { name: 'Categoría' }));

    const field = screen.getByLabelText('Buscar por nombre');
    await fireEvent(field, 'focus');
    expect(flat(screen.getByTestId('athlete-search'))).toMatchObject(ring);
    await fireEvent(field, 'blur');
    expect(flat(screen.getByTestId('athlete-search')).outlineWidth).toBeUndefined();
  });
});
