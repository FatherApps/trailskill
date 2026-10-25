import { fireEvent, render, screen } from '@testing-library/react-native';

import { FulfillmentScreen, type FulfillmentView } from '../screens/FulfillmentScreen';
import { fulfillmentFixture } from '../__fixtures__/fulfillment';

const { grid, noAthletes, noBlocks, planName, dateLabel } = fulfillmentFixture;

function setup(view: FulfillmentView) {
  const onCycle = jest.fn();
  return { onCycle, ui: <FulfillmentScreen planName={planName} dateLabel={dateLabel} view={view} onCycle={onCycle} /> };
}

describe('FulfillmentScreen states', () => {
  it('shows the plan, the date, the hint and the grid with data', async () => {
    const { onCycle, ui } = setup({ kind: 'data', content: grid });
    await render(ui);

    expect(screen.getByRole('header', { name: 'Resistencia aeróbica' })).toBeOnTheScreen();
    expect(screen.getByText('Cumplimiento · 24 oct')).toBeOnTheScreen();
    expect(screen.getByText('Toca una celda para cambiar su estado.')).toBeOnTheScreen();
    expect(screen.queryByTestId('banner')).toBeNull();
    await fireEvent.press(screen.getAllByRole('button')[0]);
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it('shows the skeleton while loading', async () => {
    await render(setup({ kind: 'loading' }).ui);

    expect(screen.getByTestId('state-view')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers a retry on error', async () => {
    const onRetry = jest.fn();
    await render(setup({ kind: 'error', onRetry }).ui);

    expect(screen.getByText('No pudimos cargar el cumplimiento')).toBeOnTheScreen();
    expect(screen.getByText('Revisa tu conexión e inténtalo de nuevo.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the grid interactive under a dated banner when offline', async () => {
    const { onCycle, ui } = setup({ kind: 'offline', storedOnLabel: '24 oct', content: grid });
    await render(ui);

    expect(screen.getByTestId('banner')).toHaveTextContent(
      'Sin conexión. Datos del 24 oct. Las marcas se guardan en la tableta y se envían cuando vuelva la señal.',
    );
    await fireEvent.press(screen.getByRole('button', { name: /^Lucía R\. · Bloque 1,/ }));
    expect(onCycle).toHaveBeenCalledWith('a1', 'b1', 'partial');
  });

  it('says there is nothing stored when offline without data', async () => {
    await render(setup({ kind: 'offline-empty' }).ui);

    expect(screen.getByText('Estás sin conexión')).toBeOnTheScreen();
    expect(screen.getByText('El cumplimiento aparecerá cuando vuelva la señal.')).toBeOnTheScreen();
  });

  it('explains the privacy rule when denied, without an action', async () => {
    await render(setup({ kind: 'denied' }).ui);

    expect(screen.getByText('Esta información es privada')).toBeOnTheScreen();
    expect(screen.getByText('Solo los entrenadores del grupo pueden ver y marcar el cumplimiento.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('invites to assign the plan when there are no athletes', async () => {
    await render(setup({ kind: 'data', content: noAthletes }).ui);

    expect(screen.getByText('Aún no hay deportistas en este plan')).toBeOnTheScreen();
    expect(screen.getByText('Asigna el plan a un grupo o a deportistas para marcar el cumplimiento.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Toca una celda para cambiar su estado.')).toBeNull();
  });

  it('invites to add blocks when the plan has none', async () => {
    await render(setup({ kind: 'data', content: noBlocks }).ui);

    expect(screen.getByText('Este plan no tiene bloques')).toBeOnTheScreen();
    expect(screen.getByText('Agrega bloques en el constructor para marcar el cumplimiento.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('nests its ScrollView so it scrolls inside a parent ScrollView on Android', async () => {
    await render(setup({ kind: 'loading' }).ui);

    let node = screen.getByRole('header').parent;
    while (node && node.props.contentContainerStyle === undefined) node = node.parent;
    if (!node) throw new Error('No ScrollView above the title');
    expect(node.props.nestedScrollEnabled).toBe(true);
  });
});
