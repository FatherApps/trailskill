import { darken } from '../darken';
import { colors } from '../tokens';

describe('darken', () => {
  it('scales each channel down by the given fraction', () => {
    expect(darken(colors.light['surface-1'], 0.08)).toBe('#EBEBEB');
    expect(darken(colors.light.action, 0)).toBe(colors.light.action);
    expect(darken(colors.light.action, 1)).toBe('#000000');
  });
});
