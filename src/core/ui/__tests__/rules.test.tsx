import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { StyleSheet } from 'react-native';

import {
  Button,
  Icon,
  NavBar,
  Segmented,
  StateView,
  StepHeader,
  SwimmerRow,
  SyncStatus,
  Tag,
  TextField,
  TimeValue,
} from '..';

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
        <Tag label="Consentimiento pendiente" variant="warn" icon="schedule" />
        <Icon name="wifi_off" accessibilityLabel="Sin conexión" />
        <StepHeader step={2} total={4} title="Datos del nadador" onBack={jest.fn()} />
        <SyncStatus state="not_sent" onRetry={jest.fn()} />
        <StateView kind="error" title="No pudimos cargar el historial" message="Revisa tu conexión." />
        <Segmented
          accessibilityLabel="Estilo"
          options={[
            { value: 'FR', label: 'Libre' },
            { value: 'BK', label: 'Espalda' },
          ]}
          value="FR"
          onChange={jest.fn()}
        />
        <TimeValue value={3482} />
        <TimeValue value={null} size="time-sm" />
        <SwimmerRow
          name="Lucía R."
          initials="LR"
          color="athlete-1"
          detail="Infantil B"
          bestTime={3482}
          bestTimeLabel="MP 50 L"
          tag={{ label: 'Consentimiento pendiente', variant: 'warn' }}
          chevron
          onPress={jest.fn()}
        />
        <NavBar
          items={[
            { id: 'home', label: 'Inicio', icon: 'home' },
            { id: 'account', label: 'Cuenta', icon: 'person' },
          ]}
          activeId="home"
          onSelect={jest.fn()}
        />
      </>,
    );

    const texts = screen.container.queryAll((node) => node.type === 'Text');
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
      expect(text.props.numberOfLines).toBeUndefined();
    }

    const controls = [
      ...screen.getAllByRole('button'),
      ...screen.getAllByRole('text', { name: /pendiente/ }),
      ...screen.getAllByRole('radio'),
      ...screen.getAllByRole('tab'),
    ];
    for (const control of controls) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.width).toBeUndefined();
      expect(style.height).toBeUndefined();
    }
  });
});
