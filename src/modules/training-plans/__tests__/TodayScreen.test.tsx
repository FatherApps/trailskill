import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors } from '../../../core/theme';
import { iconPaths } from '../../../core/ui';
import { TodayScreen, type TodayContent, type TodayView } from '../screens/TodayScreen';
import { plansFixture } from '../__fixtures__/plans';

const content: TodayContent = plansFixture.today;

function setup(view: TodayView) {
  const onSendNotice = jest.fn();
  return { onSendNotice, ui: <TodayScreen athleteName="Lucía R." view={view} onSendNotice={onSendNotice} /> };
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

  it('says there is no linked athlete and leads to "Mis deportistas" when the user manages nobody', async () => {
    const onOpenAthletes = jest.fn();
    await render(setup({ kind: 'no-athletes', onOpenAthletes }).ui);

    expect(screen.getByText('Aún no hay un deportista vinculado')).toBeOnTheScreen();
    expect(screen.getByText('Agrega o vincula un deportista desde «Mis deportistas» para ver aquí su plan de entrenamiento.')).toBeOnTheScreen();
    expect(screen.queryByText('Hoy no hay plan')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Ir a Mis deportistas' }));
    expect(onOpenAthletes).toHaveBeenCalledTimes(1);
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

    // One heading, announced with the visible title (the plan) and keeping "Hoy", then the athlete and the summary.
    expect(screen.getAllByRole('header')).toHaveLength(1);
    expect(screen.getByRole('header', { name: 'Hoy · Resistencia aeróbica, Lucía R., 950 m · 5 bloques' })).toBeOnTheScreen();
    expect(screen.getByText('Resistencia aeróbica')).toBeOnTheScreen();
    expect(screen.getByText('1 × 200 m Libre')).toBeOnTheScreen();
    expect(screen.queryByTestId('banner')).toBeNull();
  });
});

describe('TodayScreen header', () => {
  it('summarises the plan from its blocks: metres and number of blocks', async () => {
    await render(setup({ kind: 'data', content }).ui);

    // 200 + 8 × 50 + 4 × 25 + 6 × 25 + 100 metres in 5 blocks.
    expect(screen.getByText('950 m · 5 bloques')).toBeOnTheScreen();
  });

  it('groups thousands with a dot and says "bloque" for one block', async () => {
    const [, main] = content.blocks;
    const one = { ...content, blocks: [{ ...main, block: { ...main.block, repetitions: 8, distance: 250 } }] };
    await render(setup({ kind: 'data', content: one }).ui);

    expect(screen.getByText('2.000 m · 1 bloque')).toBeOnTheScreen();
  });

  it('shows the blocks without distance apart, in the card and the heading', async () => {
    const [first, main] = content.blocks;
    const drills = { ...content, blocks: [first, { ...main, block: { ...main.block, distance: 0 } }] };
    await render(setup({ kind: 'data', content: drills }).ui);

    expect(screen.getByText('200 m + 1 bloque sin distancia')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Hoy · Resistencia aeróbica, Lucía R., 200 m + 1 bloque sin distancia' })).toBeOnTheScreen();
  });

  it('never shows "0 m", in the card or the heading, when no block adds metres', async () => {
    const none = { ...content, blocks: content.blocks.slice(0, 2).map((entry) => ({ ...entry, block: { ...entry.block, distance: 0 } })) };
    await render(setup({ kind: 'data', content: none }).ui);

    expect(screen.getByText('2 bloques')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Hoy · Resistencia aeróbica, Lucía R., 2 bloques' })).toBeOnTheScreen();
    expect(screen.queryByText(/^0 m/)).toBeNull();
  });

  it('invents no schedule or group: the plan has none', async () => {
    await render(setup({ kind: 'data', content }).ui);

    expect(screen.queryByText(/Grupo/)).toBeNull();
    expect(screen.queryByText(/p\. m\./)).toBeNull();
  });
});

describe('TodayScreen athlete picker', () => {
  const picker = (selectedAthleteId = 'a1', athletes = plansFixture.athletes) => {
    const onSelectAthlete = jest.fn();
    return {
      onSelectAthlete,
      ui: <TodayScreen athleteName="Lucía R." view={{ kind: 'data', content }} athletes={athletes} selectedAthleteId={selectedAthleteId} onSelectAthlete={onSelectAthlete} onSendNotice={jest.fn()} />,
    };
  };

  it('shows one chip per athlete with the initials dot, the selected one checked', async () => {
    await render(picker().ui);

    expect(screen.getByLabelText('Deportista')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Lucía R.' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tomás R.' })).not.toBeChecked();
    expect(screen.getByText('TR', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('changes the athlete when a chip is pressed', async () => {
    const { onSelectAthlete, ui } = picker();
    await render(ui);

    await fireEvent.press(screen.getByRole('radio', { name: 'Tomás R.' }));
    expect(onSelectAthlete).toHaveBeenCalledWith('a2');
  });

  it('does not show the chips with a single athlete', async () => {
    await render(picker('a1', plansFixture.athletes.slice(0, 1)).ui);

    expect(screen.queryByLabelText('Deportista')).toBeNull();
  });

  it('colours the header with the selected athlete', async () => {
    await render(picker('a2').ui);

    expect(screen.getByText('Resistencia aeróbica').parent).toHaveStyle({ backgroundColor: colors.light['athlete-2'] });
  });
});

describe('TodayScreen blocks card', () => {
  it('lists every block as a row of one card, with the bar of its phase', async () => {
    await render(setup({ kind: 'data', content }).ui);

    expect(screen.getAllByTestId('phase-bar')).toHaveLength(5);
    expect(screen.getAllByTestId('block-row')).toHaveLength(5);
    expect(screen.getByText('Principal · Salida cada 1:00 · Implementos: Paletas')).toBeOnTheScreen();
  });

  it('keeps the report button after the equipment, with the same label', async () => {
    await render(setup({ kind: 'data', content }).ui);

    expect(screen.getByRole('button', { name: 'Avisar algo al entrenador' })).toBeOnTheScreen();
  });

  it('draws no icon in the report button: the info glyph belongs to the plan-changed banner', async () => {
    await render(setup({ kind: 'data', content }).ui);

    const drawn = screen.container.queryAll((node) => node.type === 'RNSVGPath').map((node) => node.props.d);
    expect(drawn).not.toContain(iconPaths.info);
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

  it('lets the athlete report something to the coach, about the whole plan or one block', async () => {
    const { onSendNotice, ui } = setup({ kind: 'data', content });
    await render(ui);

    await fireEvent.press(screen.getByRole('button', { name: 'Avisar algo al entrenador' }));
    await fireEvent.changeText(screen.getByLabelText('Tu aviso'), 'Test note 1');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar aviso' }));
    expect(onSendNotice).toHaveBeenCalledWith({ blockId: null, body: 'Test note 1' });

    await fireEvent.press(screen.getByRole('button', { name: 'Avisar algo al entrenador' }));
    await fireEvent.press(screen.getByText('Bloque 2'));
    await fireEvent.changeText(screen.getByLabelText('Tu aviso'), 'Test note 2');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar aviso' }));
    expect(onSendNotice).toHaveBeenLastCalledWith({ blockId: content.blocks[1].block.id, body: 'Test note 2' });
  });

  it('asks for a text before sending and shows a note whose block is gone as a whole-plan note', async () => {
    const { onSendNotice, ui } = setup({ kind: 'data', content: { ...content, notes: [{ id: 'n1', body: 'Test note 1', dateLabel: '2 nov', blockId: 'gone' }] } });
    await render(ui);

    expect(screen.getByText('2 nov · Todo el plan')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Avisar algo al entrenador' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar aviso' }));
    expect(screen.getByText('Escribe tu aviso antes de enviarlo.')).toBeOnTheScreen();
    expect(onSendNotice).not.toHaveBeenCalled();
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
