import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { schoolNameFixture, storedOnFixture } from '../__fixtures__/athletes';
import { recordCategoryFixture, recordsFixture } from '../__fixtures__/records';
import { RecordsScreen, type RecordsContent, type RecordsScreenProps, type RecordsView } from '../screens/RecordsScreen';

const content: RecordsContent = { updatedMinutesAgo: 2, category: recordCategoryFixture, rows: recordsFixture, pool: 'SCM' };
const hidden = { includeHiddenElements: true };

const show = async (view: RecordsView, extra: Partial<RecordsScreenProps> = {}) => {
  const actions = { onNavigate: jest.fn(), onCategoryPress: jest.fn(), onPoolChange: jest.fn() };
  await render(<RecordsScreen width={1280} schoolName={schoolNameFixture} view={view} {...actions} {...extra} />);
  return actions;
};

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('RecordsScreen', () => {
  describe('with data', () => {
    it('shows the title, the caption, the filters and one row per event of the pool, in the records section', async () => {
      await show({ kind: 'data', content });

      expect(screen.getByRole('header', { name: 'Récords' })).toBeOnTheScreen();
      expect(screen.getByText('4 pruebas · Actualizado hace 2 min')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Récords' })).toBeSelected();
      expect(screen.getByRole('button', { name: 'Categoría: Categoría B' })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: '25 m' })).toBeChecked();
      expect(screen.getAllByTestId('record-row')).toHaveLength(4);
    });

    it('filters by the pool of the content and counts only its events', async () => {
      await show({ kind: 'data', content: { ...content, pool: 'LCM' } });

      expect(screen.getByRole('radio', { name: '50 m' })).toBeChecked();
      expect(screen.getAllByTestId('record-row')).toHaveLength(2);
      expect(screen.getByText('2 pruebas · Actualizado hace 2 min')).toBeOnTheScreen();
    });

    it('uses the singular for one event', async () => {
      await show({ kind: 'data', content: { ...content, rows: [recordsFixture[0]] } });

      expect(screen.getByText('1 prueba · Actualizado hace 2 min')).toBeOnTheScreen();
    });

    it('only calls back when the pool or the category is pressed', async () => {
      const { onPoolChange, onCategoryPress, onNavigate } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getByRole('radio', { name: '50 m' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Categoría: Categoría B' }));
      await fireEvent.press(screen.getByRole('tab', { name: 'Mediciones' }));

      expect(onPoolChange).toHaveBeenCalledWith('LCM');
      expect(onCategoryPress).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith('measurements');
    });

    it('shows a dash for an event without a mark', async () => {
      await show({ kind: 'data', content });

      expect(screen.getAllByText('—', hidden)).toHaveLength(3);
      expect(screen.queryByText('0,00', hidden)).toBeNull();
    });

    it('offers no way to edit or delete a record', async () => {
      await show({ kind: 'data', content });

      expect(screen.queryByRole('button', { name: /editar|eliminar|corregir/i })).toBeNull();
    });
  });

  describe('by width', () => {
    it('expanded: the table with its headers', async () => {
      await show({ kind: 'data', content }, { width: 1280 });

      expect(screen.getByTestId('console-nav-side')).toBeOnTheScreen();
      expect(screen.getByText('Mejor marca', hidden)).toBeOnTheScreen();
    });

    it('medium: navigation on top and the table', async () => {
      await show({ kind: 'data', content }, { width: 800 });

      expect(screen.getByTestId('console-nav-top', hidden)).toBeOnTheScreen();
      expect(screen.getByText('Mejor marca', hidden)).toBeOnTheScreen();
    });

    it('compact: a list without headers, with the top navigation', async () => {
      await show({ kind: 'data', content }, { width: 599 });

      expect(screen.queryByTestId('console-nav-side')).toBeNull();
      expect(screen.getByTestId('console-layout-compact')).toBeOnTheScreen();
      expect(screen.getByTestId('console-nav-top', hidden)).toBeOnTheScreen();
      expect(screen.queryByText('Mejor marca', hidden)).toBeNull();
      expect(screen.getAllByTestId('record-row')).toHaveLength(4);
    });
  });

  describe('view states', () => {
    it('loading shows the loading state under the title', async () => {
      await show({ kind: 'loading' });

      expect(screen.getByRole('header', { name: 'Récords' })).toBeOnTheScreen();
      expect(screen.getByTestId('state-view')).toHaveProp('accessibilityState', { busy: true });
      expect(screen.queryByRole('radio')).toBeNull();
    });

    it('empty says what will appear and who creates it', async () => {
      await show({ kind: 'empty' });

      expect(screen.getByText('Aún no hay récords')).toBeOnTheScreen();
      expect(screen.getByText('Aparecen cuando los entrenadores registran marcas de los deportistas de la categoría.')).toBeOnTheScreen();
      expect(screen.queryByRole('radio')).toBeNull();
    });

    it('error says what failed and retries', async () => {
      const onRetry = jest.fn();
      await show({ kind: 'error', onRetry });

      expect(screen.getByText('No pudimos cargar los récords')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('offline with stored data shows a dated banner above the table', async () => {
      await show({ kind: 'offline', storedOn: storedOnFixture, content });

      expect(screen.getByTestId('banner')).toHaveTextContent(
        'Estás sin conexión Mostramos lo guardado en este dispositivo el 23 de octubre de 2026.',
      );
      expect(screen.getAllByTestId('record-row')).toHaveLength(4);
    });

    it('offline without data uses the offline state', async () => {
      await show({ kind: 'offline-empty' });

      expect(screen.getByText('No hay récords guardados en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
    });

    it('denied says only that it is private, with no data', async () => {
      await show({ kind: 'denied' });

      expect(screen.getByText('Esta información es privada')).toBeOnTheScreen();
      expect(screen.queryByTestId('record-row')).toBeNull();
    });
  });
});
