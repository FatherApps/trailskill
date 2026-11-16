import { render, screen, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet, Text } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import { ConsoleScreen } from '..';
import { MySwimmersScreen } from '../screens/MySwimmersScreen';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

const footer = <Text>Cerrar sesión</Text>;
type Node = ReturnType<typeof screen.getByTestId>;
// The host view around a host node: what the section is laid out in.
const hostParent = (node: Node) => node.parent!;
const insideScroll = (node: Node) => {
  for (let current: Node | null = node; current; current = current.parent) if (String(current.type) === 'RCTScrollView') return true;
  return false;
};

// Jest has no layout engine, so these tests pin the structure that gives the footer room: it never shares a container with the section.
describe('the staff entries on a wide console (#1105)', () => {
  it('2560x1600: the footer sits beside a bounded slot of the section, never inside the section itself', async () => {
    await render(
      <ThemeProvider>
        <ConsoleScreen width={2560} schoolName="Escuela Delfines" footer={footer} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Cerrar sesión')).toBeOnTheScreen();
    // The section fills the height the footer leaves; a section that is a direct sibling of the footer takes the whole height
    // (its list is as tall as the screen) and pushes the footer out of view.
    const slot = hostParent(screen.getByTestId('console-layout-expanded'));
    expect(StyleSheet.flatten(slot.props.style)).toMatchObject({ flex: 1 });
    expect(within(slot).queryByText('Cerrar sesión')).toBeNull();
  });
});

describe('the staff entries in My swimmers (#1105)', () => {
  it('360 dp, no navigation: the footer is inside the one scroll of the content, so it is always reachable', async () => {
    await render(
      <ThemeProvider>
        <MySwimmersScreen width={360} schoolName="Escuela Delfines" view={{ kind: 'empty' }} onOpen={() => {}} onBack={() => {}} footer={footer} />
      </ThemeProvider>,
    );

    expect(screen.queryByRole('tab')).toBeNull();
    expect(insideScroll(screen.getByText('Cerrar sesión'))).toBe(true);
  });
});

