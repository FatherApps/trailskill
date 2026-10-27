import { closest, rowLabel } from '../__fixtures__/historyRows';

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
