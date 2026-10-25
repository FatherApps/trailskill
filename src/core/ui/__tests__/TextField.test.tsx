import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, size, type ThemeName } from '../../theme';
import { iconPaths } from '../icons';
import { TextField, textFieldColors } from '../TextField';

const themes: ThemeName[] = ['light', 'dark'];
const paths = (name: keyof typeof iconPaths) =>
  screen.container.queryAll((node) => node.type === 'RNSVGPath' && node.props.d === iconPaths[name]);
const states = Object.keys(textFieldColors) as (keyof typeof textFieldColors)[];

describe('TextField', () => {
  it('labels the input and reads the help text as its hint', async () => {
    const onChangeText = jest.fn();
    await render(
      <TextField
        label="Correo electrónico"
        help="Te enviaremos un código para confirmar."
        placeholder="nombre@correo.com"
        value=""
        onChangeText={onChangeText}
      />,
    );

    const input = screen.getByLabelText('Correo electrónico');
    expect(input.props.accessibilityHint).toBe('Te enviaremos un código para confirmar.');
    expect(input).toBeEnabled();
    expect(screen.getByText('Correo electrónico')).toBeOnTheScreen();

    fireEvent.changeText(input, 'ana@correo.com');
    expect(onChangeText).toHaveBeenCalledWith('ana@correo.com');
  });

  it('shows the error in place of the help text and reads it as the hint', async () => {
    await render(
      <TextField
        label="Celular"
        help="Diez dígitos"
        error="Faltan dígitos. Escribe los 10 números del celular."
        value="300 12"
      />,
    );

    const input = screen.getByLabelText('Celular');
    expect(input.props.accessibilityHint).toBe('Faltan dígitos. Escribe los 10 números del celular.');
    expect(screen.getByText('Faltan dígitos. Escribe los 10 números del celular.')).toBeOnTheScreen();
    expect(screen.queryByText('Diez dígitos')).toBeNull();
    expect(StyleSheet.flatten(input.parent?.props.style).backgroundColor).toBe(colors.light['danger-bg']);
  });

  it('a protected field is not editable and is announced as disabled', async () => {
    await render(<TextField label="Documento del nadador" value="Registrado · ••••42" protected />);

    const input = screen.getByLabelText('Documento del nadador');
    expect(input.props.editable).toBe(false);
    expect(input).toBeDisabled();
    expect(StyleSheet.flatten(input.parent?.props.style).backgroundColor).toBe(colors.light['surface-2']);
  });

  it('shows the error icon beside the error message, hidden from screen readers', async () => {
    await render(<TextField label="Celular" error="Faltan dígitos." value="300 12" />);

    expect(paths('error')).toHaveLength(1);
    expect(paths('lock')).toHaveLength(0);
    expect(screen.queryByRole('image')).toBeNull();
    expect(screen.getByText('Faltan dígitos.').props.accessibilityLiveRegion).toBe('polite');
  });

  it('shows no error icon without an error', async () => {
    await render(<TextField label="Celular" help="Diez dígitos" value="" />);

    expect(paths('error')).toHaveLength(0);
  });

  it('treats an empty error as no error', async () => {
    await render(<TextField label="Celular" error="" value="" />);

    const input = screen.getByLabelText('Celular');
    expect(input.props.accessibilityHint).toBeUndefined();
    expect(StyleSheet.flatten(input.parent?.props.style).backgroundColor).toBe(colors.light['surface-1']);
    expect(paths('error')).toHaveLength(0);
  });

  it('falls back to the help text when the error is empty', async () => {
    await render(<TextField label="Celular" help="Diez dígitos" error="" value="" />);

    expect(screen.getByLabelText('Celular').props.accessibilityHint).toBe('Diez dígitos');
    expect(screen.getByText('Diez dígitos', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('a protected field shows a lock inside the box, before the input', async () => {
    await render(<TextField label="Documento del nadador" value="Registrado · ••••42" protected />);

    expect(paths('lock')).toHaveLength(1);
    const box = screen.getByLabelText('Documento del nadador').parent;
    expect(box?.children.length).toBe(2);
  });

  it('a protected field stays read-only even with readOnly={false}', async () => {
    await render(<TextField label="Documento del nadador" value="Registrado · ••••42" protected readOnly={false} />);

    const input = screen.getByLabelText('Documento del nadador');
    expect(input.props.readOnly).toBe(true);
    expect(input.props.editable).toBe(false);
    expect(input).toBeDisabled();
  });

  it('a plain read-only field shows no lock', async () => {
    await render(<TextField label="Categoría" value="Infantil B" readOnly />);

    expect(paths('lock')).toHaveLength(0);
    expect(screen.getByLabelText('Categoría').props.readOnly).toBe(true);
  });

  it('a read-only field is announced as disabled', async () => {
    await render(<TextField label="Categoría" value="Infantil B" readOnly />);

    expect(screen.getByLabelText('Categoría')).toBeDisabled();
  });

  it('keeps at least field-h height and the small radius', async () => {
    await render(<TextField label="Nombre del acudiente" value="" />);

    const input = screen.getByLabelText('Nombre del acudiente');
    const box = StyleSheet.flatten(input.parent?.props.style);
    expect(box.minHeight).toBeGreaterThanOrEqual(size['field-h']);
    expect(box.borderRadius).toBe(12);
    expect(StyleSheet.flatten(input.props.style).fontSize).toBe(16);
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it.each(states)('%s input text and placeholder are at least 4.5:1', (state) => {
      const { background, text, placeholder } = textFieldColors[state];
      expect(contrastRatio(c[text], c[background])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c[placeholder], c[background])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(states)('%s label and help are at least 4.5:1 on the canvas and on cards', (state) => {
      const { label, help } = textFieldColors[state];
      for (const surface of [c['surface-0'], c['surface-1']]) {
        expect(contrastRatio(c[label], surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c[help], surface)).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
