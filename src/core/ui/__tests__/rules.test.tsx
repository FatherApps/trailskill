import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { StyleSheet } from 'react-native';

import { Button, Tag, TextField } from '..';

const uiDir = path.join(__dirname, '..');

function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  });
}

describe('src/core/ui rules', () => {
  it('no file contains a hexadecimal color literal', () => {
    const offenders = filesIn(uiDir).filter((file) =>
      /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps font scaling on and never clips text with fixed sizes or line limits', async () => {
    await render(
      <>
        <Button label="Guardar tiempo" onPress={jest.fn()} />
        <Button label="Autorizar" disabledReason="Solo el acudiente puede autorizar" onPress={jest.fn()} />
        <Button label="Guardar tiempo" loading loadingLabel="Guardando" onPress={jest.fn()} />
        <TextField label="Celular" help="Diez dígitos" value="" />
        <TextField label="Correo" error="Escribe un correo válido." value="" />
        <Tag label="Consentimiento pendiente" variant="warn" />
      </>,
    );

    const texts = screen.container.queryAll((node) => node.type === 'Text');
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
      expect(text.props.numberOfLines).toBeUndefined();
    }

    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('text', { name: /pendiente/ })]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.width).toBeUndefined();
      expect(style.height).toBeUndefined();
    }
  });
});
