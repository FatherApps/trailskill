import { orderedSelection, toggleAthlete } from '../domain/athleteSelection';

describe('athlete selection', () => {
  it('appends an athlete that is not selected, so the order is the order of choosing', () => {
    expect(toggleAthlete(['a3'], 'a1')).toEqual(['a3', 'a1']);
  });

  it('removes an athlete that is already selected and keeps the order of the rest', () => {
    expect(toggleAthlete(['a3', 'a1', 'a2'], 'a1')).toEqual(['a3', 'a2']);
  });

  it('returns the athletes in the chosen order and ignores ids that are not in the list', () => {
    const list = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];

    expect(orderedSelection(list, ['a3', 'zz', 'a1'])).toEqual([{ id: 'a3' }, { id: 'a1' }]);
  });
});
