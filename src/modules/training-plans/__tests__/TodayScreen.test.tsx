import { fireEvent, render, screen } from '@testing-library/react-native';

import { iconPaths } from '../../../core/ui';
import { TodayScreen, type TodayContent, type TodayView } from '../screens/TodayScreen';
import { plansFixture } from '../__fixtures__/plans';

const content: TodayContent = plansFixture.today;

function setup(view: TodayView) {
  const onReportToCoach = jest.fn();
  return { onReportToCoach, ui: <TodayScreen athleteName="Lucía R." view={view} onReportToCoach={onReportToCoach} /> };
}

describe('TodayScreen states', () => {
  it('shows the skeleton state while loading', async () => {
    await render(setup({ kind: 'loading' }).ui);

    expect(screen.getByText('Hoy')).toBeOnTheScreen();
    expect(screen.getByTestId('state-view')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Avisar algo al entrenador' })).toBeNull();
  });

  it('invites to wait for a plan when there is none today', async () => {
    await render(setup({ kind: 'empty' }).ui);

    expect(screen.getByText('Hoy no hay plan')).toBeOnTheScreen();
    expect(screen.getByText('Cuando tu entrenador asigne un plan para hoy, aparecerá aquí.')).toBeOnTheScreen();
    expect(screen.getByText('Lucía R.')).toBeOnTheScreen();
  });

  it('offers a retry on error', async () => {
    const onRetry = jest.fn();
    await render(setup({ kind: 'error', onRetry }).ui);

    expect(screen.getByText('No pudimos cargar el plan de hoy')).toBeOnTheScreen();
    expect(screen.getByText('Revisa tu conexión e inténtalo de nuevo.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the stored plan under a dated banner when offline', async () => {
    await render(setup({ kind: 'offline', storedOnLabel: '25 oct', content }).ui);

    expect(screen.getByTestId('banner')).toHaveTextContent('Sin conexión. Plan guardado el 25 oct.');
    expect(screen.getByText('4 × 25 m Patada')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Avisar algo al entrenador' })).toBeOnTheScreen();
  });

  it('says there is nothing stored when offline without data', async () => {
    await render(setup({ kind: 'offline-empty' }).ui);

    expect(screen.getByText('Estás sin conexión')).toBeOnTheScreen();
    expect(screen.getByText('El plan de hoy aparecerá cuando vuelva la señal.')).toBeOnTheScreen();
  });

  it('explains the privacy rule when denied, without an action', async () => {
    await render(setup({ kind: 'denied' }).ui);

    expect(screen.getByText('Esta información es privada')).toBeOnTheScreen();
    expect(screen.getByText('Solo Lucía R., sus acudientes y sus entrenadores pueden ver este plan.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the plan, the athlete and the blocks with data', async () => {
    await render(setup({ kind: 'data', content }).ui);

    expect(screen.getByRole('header', { name: 'Hoy' })).toBeOnTheScreen();
    expect(screen.getByText('Resistencia aeróbica · Lucía R.')).toBeOnTheScreen();
    expect(screen.getByText('1 × 200 m Libre')).toBeOnTheScreen();
    expect(screen.queryByTestId('banner')).toBeNull();
  });
});

describe('TodayScreen content', () => {
  it('lists the equipment once each, in first-appearance order', async () => {
    await render(setup({ kind: 'data', content }).ui);

    expect(screen.getByText('Lleva hoy')).toBeOnTheScreen();
    // Aletas appears in two blocks; the Tags are the only elements with exactly these labels.
    expect(screen.getAllByLabelText('Aletas').filter((node) => node.props.accessibilityRole === 'text')).toHaveLength(1);
    const labels = screen
      .getAllByRole('text')
      .map((node) => node.props.accessibilityLabel)
      .filter((label) => ['Paletas', 'Aletas', 'Tabla'].includes(label));
    expect(labels).toEqual(['Paletas', 'Aletas', 'Tabla']);
  });

  it('says no equipment is needed when no block uses any', async () => {
    const bare = { ...content, blocks: content.blocks.map(({ block, ...rest }) => ({ ...rest, block: { ...block, equipment: [] } })) };
    await render(setup({ kind: 'data', content: bare }).ui);

    expect(screen.getByText('Hoy no necesitas implementos.')).toBeOnTheScreen();
  });

  it('shows the status of every block', async () => {
    await render(setup({ kind: 'data', content }).ui);

    expect(screen.getAllByLabelText('Hecho')).toHaveLength(2);
    expect(screen.getByLabelText('Parcial · 3 de 8')).toBeOnTheScreen();
    expect(screen.getByLabelText('No asistió')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sin marcar')).toBeOnTheScreen();
  });

  it('draws the partial and not-marked tags with their icons', async () => {
    await render(setup({ kind: 'data', content }).ui);

    const drawn = screen.container.queryAll((node) => node.type === 'RNSVGPath').map((node) => node.props.d);
    expect(drawn).toContain(iconPaths.incomplete_circle);
    expect(drawn).toContain(iconPaths.radio_button_unchecked);
  });

  it.each([3, 2])('takes the partial count (%i) from completedRepetitions, not from the recorded times', async (completedRepetitions) => {
    const [, main] = content.blocks;
    const partial = { ...content, blocks: [{ ...main, completedRepetitions, times: [3105, null, 3162] }] };
    await render(setup({ kind: 'data', content: partial }).ui);

    expect(screen.getByLabelText(`Parcial · ${completedRepetitions} de 8`)).toBeOnTheScreen();
    expect(screen.getByText('—')).toBeOnTheScreen();
  });

  it('never shows a time for a completion-only block, not even a zero', async () => {
    const [first] = content.blocks;
    await render(setup({ kind: 'data', content: { ...content, blocks: [{ ...first, status: 'done', times: [0] }] } }).ui);

    expect(screen.getByLabelText('Hecho')).toBeOnTheScreen();
    expect(screen.queryByText('0,00', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText(/0,00/, { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText(/Rep\. /, { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('Total serie', { includeHiddenElements: true })).toBeNull();
  });

  it('shows one time per repetition, "—" for a missing one', async () => {
    await render(setup({ kind: 'data', content }).ui);

    expect(screen.getByText('Rep. 1')).toBeOnTheScreen();
    expect(screen.getByText('Rep. 3')).toBeOnTheScreen();
    expect(screen.getByText('31,05')).toBeOnTheScreen();
    expect(screen.getByText('31,62')).toBeOnTheScreen();
    expect(screen.getByText('—')).toBeOnTheScreen();
  });

  it('shows the series total once', async () => {
    await render(setup({ kind: 'data', content }).ui);

    expect(screen.getByText('Total serie')).toBeOnTheScreen();
    expect(screen.getByText('1:38,40')).toBeOnTheScreen();
  });

  it('lets the athlete report something to the coach', async () => {
    const { onReportToCoach, ui } = setup({ kind: 'data', content });
    await render(ui);

    await fireEvent.press(screen.getByRole('button', { name: 'Avisar algo al entrenador' }));

    expect(onReportToCoach).toHaveBeenCalledTimes(1);
  });

  it('nests its ScrollView so it scrolls inside a parent ScrollView on Android', async () => {
    await render(setup({ kind: 'loading' }).ui);

    // Walk up from the title to the ScrollView (the jest mock wraps it, so match its props, not its type).
    let node = screen.getByText('Hoy').parent;
    while (node && node.props.contentContainerStyle === undefined) node = node.parent;
    if (!node) throw new Error('No ScrollView above the title');
    expect(node.props.nestedScrollEnabled).toBe(true);
  });
});
