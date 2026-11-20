import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, radius, size, ThemeProvider } from '../../theme';
import { BackButton, backButtonColors } from '../BackButton';

const renderButton = async () => {
  const onPress = jest.fn();
  await render(
    <ThemeProvider>
      <BackButton onPress={onPress} />
    </ThemeProvider>,
  );
  return onPress;
};

describe('BackButton', () => {
  it('is a button named with the translated common.back key', async () => {
    await renderButton();

    expect(screen.getByRole('button', { name: 'Volver' })).toBeOnTheScreen();
  });

  it('is the design system round button: surface-1 fill, no border, 48 dp touch target', async () => {
    await renderButton();

    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Volver' }).props.style);
    expect(style.minWidth).toBe(size['target-min']);
    expect(style.minHeight).toBe(size['target-min']);
    expect(style.borderRadius).toBe(radius.full);
    expect(style.backgroundColor).toBe(colors.light[backButtonColors.background]);
    expect(style.borderWidth).toBeUndefined();
  });

  it('is capped at its own width and has no alignSelf, so a column does not stretch it and a row keeps centring it', async () => {
    await renderButton();

    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Volver' }).props.style);
    expect(style.maxWidth).toBe(size['target-min']);
    expect(style.width).toBeUndefined();
    expect(style.alignSelf).toBeUndefined();
  });

  it('calls onPress when pressed', async () => {
    const onPress = await renderButton();

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

// One Back control: a screen draws it with BackButton, never with its own arrow_back icon (the design system has a single look for it).
describe('the Back control of the app', () => {
  const { readdirSync, readFileSync, statSync } = jest.requireActual<typeof import('fs')>('fs');
  const { join } = jest.requireActual<typeof import('path')>('path');
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name: string) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' || name === '__fixtures__' ? [] : sources(path);
      return /\.tsx$/.test(name) ? [path] : [];
    });

  it('is drawn with arrow_back only inside BackButton', () => {
    const drawing = sources(join(__dirname, '..', '..', '..')).filter((file) => /name="arrow_back"|icon="arrow_back"/.test(readFileSync(file, 'utf8')));

    expect(drawing.map((file: string) => file.split('/').pop())).toEqual(['BackButton.tsx']);
  });
});
