import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { colors, ringGapColor, size, ThemeProvider, type ThemeName } from '../../theme';
import { AthleteAvatar, type AthleteAvatarProps } from '../AthleteAvatar';

const themes: ThemeName[] = ['light', 'dark'];
const photoUri = 'file:///synthetic/avatar.png';

const base: AthleteAvatarProps = { initials: 'LR', colorIndex: 1, size: 'md', authorized: false };

const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never);
const initialsText = () => screen.queryByText('LR', { includeHiddenElements: true });
// The circle is the parent of the initials text.
const circle = () => flat(initialsText()!.parent as never);
const photo = () => screen.queryByTestId('athlete-avatar-photo', { includeHiddenElements: true });

const realGet = Dimensions.get.bind(Dimensions);
const setOsFontScale = (fontScale: number) =>
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale }));

beforeEach(() => setOsFontScale(1));
afterEach(() => jest.restoreAllMocks());

describe('AthleteAvatar', () => {
  it.each([
    ['sm', 28],
    ['md', 40],
    ['lg', 64],
  ] as const)('draws a %s circle of %i dp at the default text scale', async (avatarSize, dp) => {
    await render(<AthleteAvatar {...base} size={avatarSize} />);

    expect(size[`avatar-${avatarSize}`]).toBe(dp);
    expect(circle()).toMatchObject({ width: dp, height: dp, borderRadius: 999 });
  });

  it.each(themes)('draws the initials in on-color on the athlete colour in the %s theme', async (theme) => {
    await render(
      <ThemeProvider name={theme}>
        <AthleteAvatar {...base} colorIndex={3} />
      </ThemeProvider>,
    );

    expect(circle().backgroundColor).toBe(colors[theme]['athlete-3']);
    expect(flat(initialsText()!).color).toBe(colors[theme]['on-color']);
  });

  it.each(themes)('draws the neutral surface-2 circle with ink text and no ring without colorIndex in the %s theme', async (theme) => {
    await render(
      <ThemeProvider name={theme}>
        <AthleteAvatar {...base} colorIndex={undefined} />
      </ThemeProvider>,
    );

    expect(circle().backgroundColor).toBe(colors[theme]['surface-2']);
    expect(flat(initialsText()!).color).toBe(colors[theme].ink);
    expect(screen.queryByTestId('athlete-avatar-ring', { includeHiddenElements: true })).toBeNull();
  });

  it.each(themes)('draws the ring-gap in white and the ring-athlete in the athlete colour, outside the circle, in the %s theme', async (theme) => {
    await render(
      <ThemeProvider name={theme}>
        <AthleteAvatar {...base} colorIndex={2} />
      </ThemeProvider>,
    );

    const ring = flat(screen.getByTestId('athlete-avatar-ring', { includeHiddenElements: true }));
    expect(ring).toMatchObject({
      borderWidth: size['ring-athlete'],
      borderColor: colors[theme]['athlete-2'],
      backgroundColor: ringGapColor,
      borderRadius: 999,
      top: -(size['ring-gap'] + size['ring-athlete']),
    });
  });

  it('is hidden from screen readers', async () => {
    await render(<AthleteAvatar {...base} />);

    const root = screen.getByTestId('athlete-avatar', { includeHiddenElements: true });
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByText('LR')).toBeNull();
  });

  describe('photo', () => {
    it('shows the initials until the photo has loaded, then the photo, with no spinner', async () => {
      await render(<AthleteAvatar {...base} photoUri={photoUri} authorized />);

      expect(photo()!.props.source).toEqual({ uri: photoUri });
      expect(initialsText()).toBeOnTheScreen();
      expect(screen.queryByRole('progressbar', { includeHiddenElements: true })).toBeNull();

      await fireEvent(photo()!, 'load');

      expect(photo()).not.toBeNull();
      expect(initialsText()).toBeNull();
    });

    it('keeps the initials and drops the image when it fails to load', async () => {
      await render(<AthleteAvatar {...base} photoUri={photoUri} authorized />);

      await fireEvent(photo()!, 'error');

      expect(initialsText()).toBeOnTheScreen();
      expect(photo()).toBeNull();
    });

    it('covers the circle with the photo, cropped to fill', async () => {
      await render(<AthleteAvatar {...base} photoUri={photoUri} authorized />);

      expect(photo()!.props.resizeMode).toBe('cover');
      expect(flat(photo()!)).toMatchObject({ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' });
    });

    it('never mounts the image without authorization', async () => {
      await render(<AthleteAvatar {...base} photoUri={photoUri} authorized={false} />);

      expect(photo()).toBeNull();
      expect(initialsText()).toBeOnTheScreen();
    });

    it('never mounts the image without a photoUri', async () => {
      await render(<AthleteAvatar {...base} authorized />);

      expect(photo()).toBeNull();
      expect(initialsText()).toBeOnTheScreen();
    });

    it('goes back to the initials when the authorization is withdrawn after the photo loaded', async () => {
      await render(<AthleteAvatar {...base} photoUri={photoUri} authorized />);
      await fireEvent(photo()!, 'load');

      await screen.rerender(<AthleteAvatar {...base} photoUri={photoUri} authorized={false} />);

      expect(photo()).toBeNull();
      expect(initialsText()).toBeOnTheScreen();
    });

    it('shows the initials again while a different photo loads', async () => {
      await render(<AthleteAvatar {...base} photoUri={photoUri} authorized />);
      await fireEvent(photo()!, 'load');

      await screen.rerender(<AthleteAvatar {...base} photoUri="file:///synthetic/other.png" authorized />);

      expect(initialsText()).toBeOnTheScreen();
    });
  });

  describe('text scale', () => {
    it.each([
      ['sm', 28],
      ['md', 40],
      ['lg', 64],
    ] as const)('keeps a square %s circle, never smaller than %i, that holds the initials at 200 %% of the OS scale', async (avatarSize, dp) => {
      setOsFontScale(2);
      await render(<AthleteAvatar {...base} size={avatarSize} />);

      const { width, height } = circle();
      const { lineHeight } = flat(initialsText()!);
      expect(width).toBe(height);
      expect(width).toBeGreaterThanOrEqual(dp);
      expect(width).toBeGreaterThanOrEqual(lineHeight * 2);
    });

    it('grows the md circle with the SwimmerRow formula at 200 % of the theme preview scale', async () => {
      await render(
        <ThemeProvider fontScale={2}>
          <AthleteAvatar {...base} />
        </ThemeProvider>,
      );

      // label lineHeight 20 at 200 % = 40, plus 2 x space-2 (8)
      expect(circle().width).toBe(56);
    });

    it('does not move the layout box when the ring is drawn', async () => {
      await render(<AthleteAvatar {...base} />);

      const root = flat(screen.getByTestId('athlete-avatar', { includeHiddenElements: true }));
      expect(root).toMatchObject({ width: 40, height: 40 });
    });
  });
});
