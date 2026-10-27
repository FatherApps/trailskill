import type { StyleProp, ViewStyle } from 'react-native';

import { closest, marginOfCard, rowLabel, rowTitleStartingWith } from '../__fixtures__/historyRows';

describe('historyRows', () => {
  describe('rowLabel', () => {
    it('matches the label of a row with that title', () => {
      expect(rowLabel('Libre 50 m').test('Libre 50 m, 18 de octubre de 2026, Competencia, Enviado')).toBe(true);
      expect(rowLabel('Libre 50 m').test('Libre 50 m, Competencia, Enviado')).toBe(true);
    });

    it('does not take a longer title for the same row', () => {
      expect(rowLabel('Libre 50 m').test('Libre 50 m espalda, 18 de octubre de 2026, Competencia, Enviado')).toBe(
        false,
      );
    });

    it('reads the title literally: its characters are not regex syntax', () => {
      expect(rowLabel('Libre 50 m.').test('Libre 50 mX, Competencia')).toBe(false);
    });

    it.each([' · ', '; ', ' - ', ' | '])('does not depend on the separator the label joins its parts with (%j)', (separator) => {
      expect(rowLabel('Libre 50 m').test(`Libre 50 m${separator}18 de octubre de 2026`)).toBe(true);
      expect(rowLabel('Libre 50 m').test(`Libre 50 m espalda${separator}18 de octubre de 2026`)).toBe(false);
    });

    it('does not take a label with nothing after the title, like the "Libre 50 m" chip of the event selector', () => {
      expect(rowLabel('Libre 50 m').test('Libre 50 m')).toBe(false);
    });
  });

  describe('rowTitleStartingWith', () => {
    it('also takes a longer title that extends it, so a leaked row cannot hide behind its extra words', () => {
      expect(rowTitleStartingWith('Libre 50 m').test('Libre 50 m espalda, 18 de octubre de 2026')).toBe(true);
      expect(rowTitleStartingWith('Libre 50 m').test('Libre 50 m, 18 de octubre de 2026')).toBe(true);
    });

    it('does not take another title, and reads the title literally', () => {
      expect(rowTitleStartingWith('Libre 50 m').test('Pecho 50 m, 18 de octubre de 2026')).toBe(false);
      expect(rowTitleStartingWith('Libre 50 m.').test('Libre 50 mX, Competencia')).toBe(false);
    });
  });

  describe('marginOfCard', () => {
    type Layer = { props: { style?: StyleProp<ViewStyle> }; parent: Layer | null };
    // The first layer is the row; the next ones are its ancestors, nearest first.
    const layers = (styles: StyleProp<ViewStyle>[]): Layer =>
      styles.reduceRight<Layer | null>((parent, style) => ({ props: { style }, parent }), null)!;

    it('reads the margin of the nearest ancestor drawn as a card (it has a background)', () => {
      const row = layers([{}, { marginHorizontal: 16, backgroundColor: '#fff' }, { marginHorizontal: 99 }]);
      expect(marginOfCard(row)).toBe(16);
    });

    it('ignores a nearer ancestor that has a margin but is not the card', () => {
      const row = layers([{}, { marginHorizontal: 99 }, { marginHorizontal: 16, backgroundColor: '#fff' }]);
      expect(marginOfCard(row)).toBe(16);
    });

    it('is undefined, not a TypeError, when the card has no margin or there is no card', () => {
      expect(marginOfCard(layers([{}, { backgroundColor: '#fff' }]))).toBeUndefined();
      expect(marginOfCard(layers([{}, { marginHorizontal: 16 }]))).toBeUndefined();
    });
  });

  describe('closest', () => {
    type Link = { value: number; parent: Link | null };
    // The first value is the node; the next ones are its ancestors, nearest first.
    const chain = (values: number[]): Link =>
      values.reduceRight<Link | null>((parent, value) => ({ value, parent }), null)!;

    it('returns the node itself when it matches', () => {
      const node = chain([1, 2, 3]);
      expect(closest(node, () => true)).toBe(node);
    });

    it('climbs to the first ancestor that matches, however deep it is', () => {
      const node = chain([1, 2, 3]);
      expect(closest(node, (candidate) => candidate.value === 3)?.value).toBe(3);
    });

    it('returns undefined when no ancestor matches', () => {
      expect(closest(chain([1, 2]), (candidate) => candidate.value === 9)).toBeUndefined();
    });
  });
});
