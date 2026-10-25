import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors, contrastRatio, size, type ThemeName } from '../../../core/theme';
import { ImportPrompt, type ImportPromptProps } from '../components/ImportPrompt';

const themes: ThemeName[] = ['light', 'dark'];

const base: ImportPromptProps = {
  athleteName: 'Lucía R.',
  sourceName: 'FEDNAT',
  imported: false,
  onDismiss: jest.fn(),
  onRefresh: jest.fn(),
};

describe('ImportPrompt', () => {
  it.each([undefined, ''])('renders nothing when the source name is %p', async (sourceName) => {
    await render(<ImportPrompt {...base} sourceName={sourceName} onLearnMore={jest.fn()} />);

    expect(screen.toJSON()).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([true, false])('shows no refresh button or notice without a source (imported: %p)', async (imported) => {
    await render(<ImportPrompt {...base} sourceName={undefined} imported={imported} />);

    expect(screen.queryByText(/Actualizar desde/)).toBeNull();
    expect(screen.queryByText('Ahora no')).toBeNull();
    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('asks before the first import with the athlete and the source filled in', async () => {
    await render(<ImportPrompt {...base} />);

    expect(screen.getByText('¿Lucía R. compitió antes?')).toBeOnTheScreen();
    expect(
      screen.getByText(/Puedes traer su historial de FEDNAT\. Tú lo confirmas antes de importar\./),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Actualizar desde/)).toBeNull();
  });

  it('calls onDismiss from "Ahora no"', async () => {
    const onDismiss = jest.fn();
    await render(<ImportPrompt {...base} onDismiss={onDismiss} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Ahora no' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('offers "Ver cómo" only with onLearnMore', async () => {
    await render(<ImportPrompt {...base} />);
    expect(screen.queryByRole('button', { name: 'Ver cómo' })).toBeNull();

    const onLearnMore = jest.fn();
    await render(<ImportPrompt {...base} onLearnMore={onLearnMore} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Ver cómo' }));

    expect(onLearnMore).toHaveBeenCalledTimes(1);
  });

  it('after an import it says so and offers "Actualizar desde FEDNAT"', async () => {
    const onRefresh = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <ImportPrompt {...base} imported onRefresh={onRefresh} onDismiss={onDismiss} onLearnMore={jest.fn()} />,
    );

    expect(screen.getByText(/Ya importamos el historial de Lucía R\. desde FEDNAT\./)).toBeOnTheScreen();
    expect(screen.queryByText(/compitió antes/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver cómo' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Actualizar desde FEDNAT' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Ahora no' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('never names an organization of its own: the source comes from props', async () => {
    await render(<ImportPrompt {...base} sourceName="Otra Fuente" imported />);

    expect(screen.getByRole('button', { name: 'Actualizar desde Otra Fuente' })).toBeOnTheScreen();
    expect(screen.queryByText(/FEDNAT/)).toBeNull();
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    it('keeps ink readable on the banner background', () => {
      const c = colors[theme];
      expect(contrastRatio(c.ink, c['primary-tint'])).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('keeps the button targets at least 48 dp', () => {
    expect(size['target-min']).toBeGreaterThanOrEqual(48);
  });
});
