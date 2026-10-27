import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { i18n } from '../../../core/i18n';
import { colors } from '../../../core/theme';
import { iconPaths } from '../../../core/ui';
import { TodayScreen, type TodayBlock, type TodayContent, type TodayView } from '../screens/TodayScreen';
import { plansFixture } from '../__fixtures__/plans';

const content: TodayContent = plansFixture.today;

// Both come from the fixture plan (blocks b1..b5), not from the screen's own sum: metres are repetitions × distance per block.
const metresOf = ({ block }: TodayBlock) => block.repetitions * block.distance;
const PLAN_SUMMARY = `${content.blocks.reduce((total, entry) => total + metresOf(entry), 0)} m · ${content.blocks.length} bloques`;

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

  it.each(['', '   '])('names "el deportista" instead of leaving a gap when the athlete name is blank (%j)', async (athleteName) => {
    await render(<TodayScreen athleteName={athleteName} view={{ kind: 'denied' }} onSendNotice={jest.fn()} />);

    expect(screen.getByText('Solo el deportista, sus acudientes y sus entrenadores pueden ver este plan.')).toBeOnTheScreen();
    expect(screen.queryByText(/Solo ,/)).toBeNull();
  });

  it('shows the plan, the athlete and the blocks with data', async () => {
    await render(setup({ kind: 'data', content }).ui);

    // One heading, announced with the visible title (the plan) and keeping "Hoy", then the athlete and the summary.
    expect(screen.getAllByRole('header')).toHaveLength(1);
    expect(screen.getByRole('header', { name: `Hoy · Resistencia aeróbica, Lucía R., ${PLAN_SUMMARY}` })).toBeOnTheScreen();
    expect(screen.getByText('Resistencia aeróbica')).toBeOnTheScreen();
    expect(screen.getByText('1 × 200 m Libre')).toBeOnTheScreen();
    expect(screen.queryByTestId('banner')).toBeNull();
  });
});

describe('TodayScreen header', () => {
  it('summarises the plan from its blocks: metres and number of blocks', async () => {
    await render(setup({ kind: 'data', content }).ui);

    expect(screen.getByText(PLAN_SUMMARY)).toBeOnTheScreen();
  });

  it('groups thousands with a dot and says "bloque" for one block', async () => {
    const [, main] = content.blocks;
    // 8 repetitions × 250 m = 2000 m, the figure whose thousands dot this checks.
    const one = { ...content, blocks: [{ ...main, block: { ...main.block, repetitions: 8, distance: 250 } }] };
    await render(setup({ kind: 'data', content: one }).ui);

    expect(screen.getByText('2.000 m · 1 bloque')).toBeOnTheScreen();
  });

  it('shows the blocks without distance apart, in the card and the heading', async () => {
    const [first, main] = content.blocks;
    const drills = { ...content, blocks: [first, { ...main, block: { ...main.block, distance: 0 } }] };
    await render(setup({ kind: 'data', content: drills }).ui);

    // Only the first block adds metres; the second, with distance 0, is counted apart.
    const summary = `${metresOf(first)} m + 1 bloque sin distancia`;
    expect(screen.getByText(summary)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: `Hoy · Resistencia aeróbica, Lucía R., ${summary}` })).toBeOnTheScreen();
  });

  it('never shows "0 m", in the card or the heading, when no block adds metres', async () => {
    expect(content.blocks).toHaveLength(5);
    const none = { ...content, blocks: content.blocks.slice(0, 2).map((entry) => ({ ...entry, block: { ...entry.block, distance: 0 } })) };
    await render(setup({ kind: 'data', content: none }).ui);

    // The two blocks kept above, so the count is the length of `none`.
    const summary = `${none.blocks.length} bloques`;
    expect(screen.getByText(summary)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: `Hoy · Resistencia aeróbica, Lucía R., ${summary}` })).toBeOnTheScreen();
    expect(screen.queryByText(/^0 m/)).toBeNull();
  });

  it('leaves no separator hanging when the athlete has no name: the caption and the label agree', async () => {
    await render(<TodayScreen athleteName="" view={{ kind: 'data', content }} onSendNotice={jest.fn()} />);

    expect(screen.getByRole('header', { name: `Hoy · Resistencia aeróbica, ${PLAN_SUMMARY}` })).toBeOnTheScreen();
    expect(screen.getByText('Hoy')).toBeOnTheScreen();
    expect(screen.queryByText(/Hoy ·/)).toBeNull();
  });

  it('leaves out the summary, with no separator hanging, for a plan without blocks', async () => {
    await render(<TodayScreen athleteName="Lucía R." view={{ kind: 'data', content: { ...content, blocks: [] } }} onSendNotice={jest.fn()} />);

    expect(screen.getByRole('header', { name: 'Hoy · Resistencia aeróbica, Lucía R.' })).toBeOnTheScreen();
  });

  it('treats a blank athlete name as missing', async () => {
    await render(<TodayScreen athleteName="   " view={{ kind: 'data', content }} onSendNotice={jest.fn()} />);

    expect(screen.getByRole('header', { name: `Hoy · Resistencia aeróbica, ${PLAN_SUMMARY}` })).toBeOnTheScreen();
    expect(screen.getByText('Hoy')).toBeOnTheScreen();
  });

  it('wraps the card in a plain block that adds no width, margin or padding, so the card keeps filling its column', async () => {
    // No Dimensions mock: the wrapper carries no style at all and TodayScreen reads no window size, so there is no tablet branch to trigger.
    await render(setup({ kind: 'data', content }).ui);

    const wrapper = screen.getByRole('header');
    expect(StyleSheet.flatten(wrapper.props.style) ?? {}).toEqual({});
    expect(screen.getByText('Resistencia aeróbica')).toBeOnTheScreen();
    expect(wrapper.children).toHaveLength(1);
  });

  it('builds the heading label from one translatable key, so a language can reorder its parts', async () => {
    const path = 'training_plans.today.heading';
    const key = `${path}_name_summary`;
    const original = i18n.getResource('es-CO', 'translation', key);
    // The override is only restored, never invented: the key must exist, so the restore below can never write undefined.
    if (typeof original !== 'string') throw new Error(`Missing translation key ${key}`);
    i18n.addResource('es-CO', 'translation', key, '{{summary}} / {{name}} / {{plan}} / {{title}}');
    try {
      await render(setup({ kind: 'data', content }).ui);

      expect(screen.getByRole('header', { name: `${PLAN_SUMMARY} / Lucía R. / Resistencia aeróbica / Hoy`})).toBeOnTheScreen();
    } finally {
      i18n.addResource('es-CO', 'translation', key, original);
    }
  });

  it('does not break when the athlete name is missing (undefined), and shows what an empty name shows', async () => {
    const view: TodayView = { kind: 'data', content };
    await render(<TodayScreen view={view} onSendNotice={jest.fn()} />);

    expect(screen.getByRole('header', { name: `Hoy · Resistencia aeróbica, ${PLAN_SUMMARY}` })).toBeOnTheScreen();
    expect(screen.getByText('Hoy')).toBeOnTheScreen();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it.each<TodayView>([{ kind: 'empty' }, { kind: 'denied' }])('does not break or print "undefined" in the $kind state without a name', async (view) => {
    await render(<TodayScreen view={view} onSendNotice={jest.fn()} />);

    expect(screen.getByText('Hoy')).toBeOnTheScreen();
    expect(screen.queryByText(/undefined/)).toBeNull();
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

  it('draws the chat bubble in the report button, decorative and without the info glyph of the plan-changed banner', async () => {
    await render(setup({ kind: 'data', content }).ui);

    const button = screen.getByRole('button', { name: 'Avisar algo al entrenador' });
    // The chat bubble is drawn, not a node that merely hides from screen readers; the info glyph of the banner is not.
    const drawn = button.queryAll((node) => node.type === 'RNSVGPath').map((node) => node.props.d);
    expect(drawn).toContain(iconPaths.chat_bubble);
    expect(drawn).not.toContain(iconPaths.info);
    // Decorative: an Icon without a label exposes no image even to a query that includes hidden nodes, so the button label carries the meaning.
    // How the Icon hides itself from screen readers is its own contract, pinned in core/ui/__tests__/Icon.test.tsx.
    expect(within(button).queryByRole('image', { includeHiddenElements: true })).toBeNull();
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

  it('keeps the text of the note in the open form while its save is pending, and clears it once it ends', async () => {
    let finish!: () => void;
    const onSendNotice = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await render(<TodayScreen athleteName="Lucía R." view={{ kind: 'data', content }} onSendNotice={onSendNotice} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Avisar algo al entrenador' }));
    await fireEvent.changeText(screen.getByLabelText('Tu aviso'), 'Test note 1');
    // The press itself ends with the save, so it is started inside act without waiting for it.
    const send = screen.getByRole('button', { name: 'Enviar aviso' });
    await act(async () => {
      void fireEvent.press(send);
    });

    // A save that does not end (no timeout, issue 625) leaves the form as it was, with the text and no error.
    expect(onSendNotice).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Tu aviso').props.value).toBe('Test note 1');
    expect(screen.queryByText('No pudimos guardar el aviso. Inténtalo de nuevo.')).not.toBeOnTheScreen();

    await act(async () => finish());
    expect(screen.queryByLabelText('Tu aviso')).not.toBeOnTheScreen();
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
