import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import { GuardianSharingPanel, type SharingRecordRow } from '../components/GuardianSharingPanel';

// Synthetic data only. 7275 = 1:12,75 (long text), 3272 = 32,72 (short text).
const longRow: SharingRecordRow = { id: 'long', event: 'Libre 200', date: '2026-11-01', time: 7275, shared: false };
const shortRow: SharingRecordRow = { id: 'short', event: 'Libre 50', date: '2026-11-02', time: 3272, shared: false };

const show = (rows: SharingRecordRow[]) =>
  render(
    <ThemeProvider>
      <GuardianSharingPanel
        scope="swimmer"
        view={{ kind: 'ready', shared: false, saving: false, error: null, onChange: jest.fn() }}
        records={{ kind: 'ready', rows, error: null, busyId: null, onToggle: jest.fn() }}
      />
    </ThemeProvider>,
  );

type Node = { type: unknown; props: { testID?: string; accessibilityRole?: string }; children: (Node | string)[] };

// The structure without the text: element types and roles, depth first, with the row id taken out of the test ids.
const shape = (node: Node | string, id: string): string[] =>
  typeof node === 'string'
    ? []
    : [`${String(node.type)}:${node.props.accessibilityRole ?? ''}:${(node.props.testID ?? '').replace(id, '<id>')}`, ...node.children.flatMap((child) => shape(child, id))];

describe('the records one by one', () => {
  it('lays out a long time and a short time the same way', async () => {
    await show([longRow, shortRow]);
    const long = screen.getByTestId('sharing-record-long');
    const short = screen.getByTestId('sharing-record-short');

    expect(shape(long as unknown as Node, 'long')).toEqual(shape(short as unknown as Node, 'short'));
    expect(StyleSheet.flatten(long.props.style).flexDirection).toBe('row');
    expect(StyleSheet.flatten(long.props.style).flexWrap).toBeUndefined();
    // Only the divider differs, and only on every row but the last.
    const { borderBottomColor, borderBottomWidth, ...longStyle } = StyleSheet.flatten(long.props.style);
    expect(longStyle).toEqual(StyleSheet.flatten(short.props.style));
    expect([borderBottomColor, borderBottomWidth]).toEqual([expect.any(String), 1]);
  });

  it('keeps the event and date on the left and the badge and the button together on the right, in every row', async () => {
    await show([longRow, shortRow]);
    for (const id of ['long', 'short']) {
      const children = (screen.getByTestId(`sharing-record-${id}`) as unknown as Node).children as Node[];
      expect(children.map((child) => child.props.testID)).toEqual([`sharing-record-${id}-info`, `sharing-record-${id}-actions`]);
    }
    expect(screen.getAllByLabelText('No compartido')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Compartir' })).toHaveLength(2);
  });
});
