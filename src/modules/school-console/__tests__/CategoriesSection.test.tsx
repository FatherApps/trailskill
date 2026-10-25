import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { categoriesFixture } from '../__fixtures__/categories';
import { CategoriesSection, createInMemoryCategoriesRepository, type CategoriesRepository } from '..';

// The index re-exports the PowerSync repository, which loads the native database module.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const memory = () => createInMemoryCategoriesRepository({ categories: categoriesFixture, athleteSchools: [] });

const section = (repository: CategoriesRepository, refreshKey?: unknown) => (
  <ThemeProvider>
    <CategoriesSection
      width={800}
      schoolName="Escuela Delfines"
      scrollEnabled={false}
      onNavigate={jest.fn()}
      repository={repository}
      schoolId="school-1"
      refreshKey={refreshKey}
    />
  </ThemeProvider>
);

const shownNames = () => screen.getAllByText(/^Categoría /).map((node) => node.props.children);

describe('CategoriesSection', () => {
  it('loads the categories of the school', async () => {
    await render(section(memory()));

    expect(await screen.findByText('Categoría A')).toBeOnTheScreen();
    expect(shownNames()).toEqual(['Categoría A', 'Categoría B', 'Categoría C']);
  });

  it('creates a category and shows it last', async () => {
    const repository = memory();
    await render(section(repository));
    await screen.findByText('Categoría A');

    await fireEvent.changeText(screen.getByLabelText('Nueva categoría'), 'Categoría D');
    await fireEvent.press(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByText('Categoría D')).toBeOnTheScreen();
    expect((await repository.list('school-1')).map((c) => c.name)).toEqual(['Categoría A', 'Categoría B', 'Categoría C', 'Categoría D']);
  });

  it('renames a category', async () => {
    await render(section(memory()));
    await screen.findByText('Categoría A');

    await fireEvent.press(screen.getAllByRole('button', { name: 'Renombrar' })[0]);
    await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), 'Categoría Z');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Categoría Z')).toBeOnTheScreen();
    expect(screen.queryByText('Categoría A')).toBeNull();
  });

  it('moves a category and keeps the new order', async () => {
    await render(section(memory()));
    await screen.findByText('Categoría A');

    await fireEvent.press(screen.getByRole('button', { name: 'Bajar Categoría A' }));

    await waitFor(() => expect(shownNames()).toEqual(['Categoría B', 'Categoría A', 'Categoría C']));
    expect(screen.getByRole('button', { name: 'Subir Categoría B' })).toBeDisabled();
  });

  it('deactivates after the confirmation and reactivates at once', async () => {
    await render(section(memory()));
    await screen.findByText('Categoría A');

    await fireEvent.press(screen.getAllByRole('button', { name: 'Desactivar' })[0]);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Desactivar' }).at(-1)!);
    await waitFor(() => expect(screen.getAllByLabelText('Inactiva')).toHaveLength(2));

    await fireEvent.press(screen.getAllByRole('button', { name: 'Reactivar' })[0]);
    await waitFor(() => expect(screen.getAllByLabelText('Inactiva')).toHaveLength(1));
  });

  it('shows the invitation when the school has no categories', async () => {
    await render(section(createInMemoryCategoriesRepository({ categories: [], athleteSchools: [] })));

    expect(await screen.findByText('Aún no hay categorías')).toBeOnTheScreen();
  });

  it('shows the error when the load fails and recovers on retry', async () => {
    const repository = memory();
    const list = jest.spyOn(repository, 'list').mockRejectedValueOnce(new Error('offline'));
    await render(section(repository));

    expect(await screen.findByText('No pudimos cargar las categorías')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByText('Categoría A')).toBeOnTheScreen();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('shows the error when a change fails', async () => {
    const repository = memory();
    jest.spyOn(repository, 'move').mockRejectedValue(new Error('category_missing'));
    await render(section(repository));
    await screen.findByText('Categoría A');

    await fireEvent.press(screen.getByRole('button', { name: 'Bajar Categoría A' }));

    expect(await screen.findByText('No pudimos cargar las categorías')).toBeOnTheScreen();
  });

  it('looks again when a sync completes', async () => {
    const repository = memory();
    const { rerender } = await render(section(repository, 1));
    await screen.findByText('Categoría A');

    await repository.create('school-1', 'Categoría D');
    expect(screen.queryByText('Categoría D')).toBeNull();
    await rerender(section(repository, 2));

    expect(await screen.findByText('Categoría D')).toBeOnTheScreen();
    expect(within(screen.getByLabelText('Categorías de la escuela')).getAllByText(/^Categoría /)).toHaveLength(4);
  });
});
