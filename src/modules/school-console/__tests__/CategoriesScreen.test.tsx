import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { categoriesFixture } from '../__fixtures__/categories';
import { CategoriesScreen, type CategoriesScreenProps } from '../screens/CategoriesScreen';

const handlers = () => ({
  onNavigate: jest.fn(),
  onCreate: jest.fn(),
  onRename: jest.fn(),
  onMove: jest.fn(),
  onSetActive: jest.fn(),
});

async function show(props: Partial<CategoriesScreenProps> = {}) {
  const calls = handlers();
  await render(
    <ThemeProvider>
      <CategoriesScreen
        width={800}
        schoolName="Escuela Delfines"
        content={{ status: 'ready', categories: categoriesFixture }}
        scrollEnabled={false}
        {...calls}
        {...props}
      />
    </ThemeProvider>,
  );
  return calls;
}

describe('CategoriesScreen', () => {
  it('shows the title and the categories in the given order, with a tag on the inactive one', async () => {
    await show();

    expect(screen.getByRole('header', { name: 'Categorías' })).toBeOnTheScreen();
    const rows = screen.getByLabelText('Categorías de la escuela');
    expect(rows).toBeOnTheScreen();
    expect(screen.getAllByText(/^Categoría [ABC]$/).map((node) => node.props.children)).toEqual(['Categoría A', 'Categoría B', 'Categoría C']);
    expect(screen.getAllByLabelText('Inactiva')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reactivar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(2);
  });

  describe('add', () => {
    it('is disabled while the trimmed name is empty', async () => {
      const { onCreate } = await show();

      expect(screen.getByRole('button', { name: /^Agregar/ })).toBeDisabled();
      await fireEvent.changeText(screen.getByLabelText('Nueva categoría'), '   ');
      expect(screen.getByRole('button', { name: /^Agregar/ })).toBeDisabled();
      await fireEvent.press(screen.getByRole('button', { name: /^Agregar/ }));
      expect(onCreate).not.toHaveBeenCalled();
    });

    it('creates the category with the trimmed name and clears the field', async () => {
      const { onCreate } = await show();

      await fireEvent.changeText(screen.getByLabelText('Nueva categoría'), '  Categoría D ');
      await fireEvent.press(screen.getByRole('button', { name: 'Agregar' }));

      expect(onCreate).toHaveBeenCalledWith('Categoría D');
      expect(screen.getByLabelText('Nueva categoría').props.value).toBe('');
    });
  });

  describe('rename', () => {
    const startRename = async () => fireEvent.press(screen.getAllByRole('button', { name: 'Renombrar' })[1]);

    it('switches the row to a field with the current name and saves the new one trimmed', async () => {
      const { onRename } = await show();

      await startRename();
      expect(screen.getByLabelText('Nombre de la categoría').props.value).toBe('Categoría B');
      await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), '  Categoría Z ');
      await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

      expect(onRename).toHaveBeenCalledWith('c2', 'Categoría Z');
      expect(screen.queryByLabelText('Nombre de la categoría')).toBeNull();
    });

    it('cancels without saving and starts the next rename from the real name', async () => {
      const { onRename } = await show();

      await startRename();
      await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), 'Categoría Z');
      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Nombre de la categoría')).toBeNull();

      await startRename();
      expect(screen.getByLabelText('Nombre de la categoría').props.value).toBe('Categoría B');
    });

    it('cannot save an empty name', async () => {
      const { onRename } = await show();

      await startRename();
      await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), '  ');
      expect(screen.getByRole('button', { name: /^Guardar/ })).toBeDisabled();
      await fireEvent.press(screen.getByRole('button', { name: /^Guardar/ }));

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Nombre de la categoría')).toBeOnTheScreen();
    });

    it('does not call back when the name did not change', async () => {
      const { onRename } = await show();

      await startRename();
      await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Nombre de la categoría')).toBeNull();
    });

    it('can start already renaming a row', async () => {
      await show({ initialRenamingId: 'c1' });

      expect(screen.getByLabelText('Nombre de la categoría').props.value).toBe('Categoría A');
    });
  });

  describe('move', () => {
    it('moves a category up and down', async () => {
      const { onMove } = await show();

      await fireEvent.press(screen.getByRole('button', { name: 'Subir Categoría B' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Bajar Categoría B' }));

      expect(onMove).toHaveBeenNthCalledWith(1, 'c2', 'up');
      expect(onMove).toHaveBeenNthCalledWith(2, 'c2', 'down');
    });

    it('disables going up from the first row and down from the last', async () => {
      const { onMove } = await show();

      expect(screen.getByRole('button', { name: 'Subir Categoría A' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Bajar Categoría C' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Bajar Categoría A' })).toBeEnabled();
      await fireEvent.press(screen.getByRole('button', { name: 'Subir Categoría A' }));
      expect(onMove).not.toHaveBeenCalled();
    });
  });

  describe('deactivate and reactivate', () => {
    const sheetConfirm = () => screen.getAllByRole('button', { name: 'Desactivar' }).at(-1)!;

    it('asks first and deactivates only on confirm', async () => {
      const { onSetActive } = await show();

      await fireEvent.press(screen.getAllByRole('button', { name: 'Desactivar' })[0]);
      expect(screen.getByText('¿Desactivar Categoría A?')).toBeOnTheScreen();
      expect(screen.getByText('Los deportistas que ya la tienen la conservan. No se podrá asignar a nuevos.')).toBeOnTheScreen();
      expect(onSetActive).not.toHaveBeenCalled();

      await fireEvent.press(sheetConfirm());
      expect(onSetActive).toHaveBeenCalledWith('c1', false);
      expect(screen.queryByText('¿Desactivar Categoría A?')).toBeNull();
    });

    it('does nothing when the confirmation is cancelled', async () => {
      const { onSetActive } = await show({ initialConfirmId: 'c2' });

      expect(screen.getByText('¿Desactivar Categoría B?')).toBeOnTheScreen();
      await fireEvent.press(screen.getAllByRole('button', { name: 'Cancelar' }).at(-1)!);

      expect(onSetActive).not.toHaveBeenCalled();
      expect(screen.queryByText('¿Desactivar Categoría B?')).toBeNull();
    });

    it('reactivates without asking', async () => {
      const { onSetActive } = await show();

      await fireEvent.press(screen.getByRole('button', { name: 'Reactivar' }));

      expect(onSetActive).toHaveBeenCalledWith('c3', true);
      expect(screen.queryByText(/^¿Desactivar/)).toBeNull();
    });
  });

  describe('states', () => {
    it('shows the add field and the invitation when there are no categories', async () => {
      await show({ content: { status: 'ready', categories: [] } });

      expect(screen.getByText('Aún no hay categorías')).toBeOnTheScreen();
      expect(screen.getByText('Agrega la primera para asignarla a tus deportistas.')).toBeOnTheScreen();
      expect(screen.getByLabelText('Nueva categoría')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Categorías de la escuela')).toBeNull();
    });

    it('shows only the loading state while loading', async () => {
      await show({ content: { status: 'loading', categories: [] } });

      expect(screen.getByTestId('state-view')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Nueva categoría')).toBeNull();
    });

    it('shows the error with a retry when given one', async () => {
      const onRetry = jest.fn();
      await show({ content: { status: 'error', categories: [] }, onRetry });

      expect(screen.getByText('No pudimos cargar las categorías')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
      expect(onRetry).toHaveBeenCalled();
    });

    it('shows the error without an action when there is no retry', async () => {
      await show({ content: { status: 'error', categories: [] } });

      expect(screen.queryByRole('button', { name: 'Intentar de nuevo' })).toBeNull();
    });
  });

  it('keeps long names whole, at any text scale', async () => {
    const name = 'Categoría de desarrollo y perfeccionamiento técnico para nadadores de iniciación avanzada';
    await render(
      <ThemeProvider fontScale={2}>
        <CategoriesScreen
          width={360}
          schoolName="Escuela Delfines"
          content={{ status: 'ready', categories: [{ id: 'c9', schoolId: 's', name, sortOrder: 0, active: true }] }}
          scrollEnabled={false}
          {...handlers()}
        />
      </ThemeProvider>,
    );

    const text = screen.getByText(name);
    expect(text.props.numberOfLines).toBeUndefined();
  });

  it('navigates through the console shell', async () => {
    const { onNavigate } = await show();

    await fireEvent.press(screen.getByRole('tab', { name: 'Deportistas' }));

    expect(onNavigate).toHaveBeenCalledWith('athletes');
  });
});
