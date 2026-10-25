import type { Hundredths } from '../../time';

// Synthetic times, in hundredths of a second, for the development gallery.
export const timeValueFixture: Record<'large' | 'medium' | 'small' | 'pbFaster' | 'pbSlower', Hundredths> = {
  large: 3482,
  medium: 7240,
  small: 1640,
  // Personal bests: 0,91 s slower than `large` and 1,05 s faster than `medium`.
  pbFaster: 3573,
  pbSlower: 7135,
};
