import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, size, type ThemeName } from '../../theme';
import { TextField, textFieldColors } from '../TextField';

const themes: ThemeName[] = ['light', 'dark'];
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
