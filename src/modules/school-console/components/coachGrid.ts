// Narrowest card that keeps the name and the actions readable at normal text size; it is not a token.
// A row narrower than twice this wraps to one column.
export const MIN_CARD_WIDTH = 240;
// Over a third of the row, so three never fit; under half, so two always do. The cards then grow to share the row.
export const TWO_COLUMN_SHARE = 0.34;
// Rounded: 0.34 * 100 is exact in floating point, but another share (0.07) would give '7.000000000000001%'.
export const TWO_COLUMN_BASIS = `${Math.round(TWO_COLUMN_SHARE * 100)}%` as const;
// How long the list waits for its first measure before it is shown without it (the last odd card uncapped).
export const MEASURE_TIMEOUT_MS = 1000;

// The width each card gets when two share a row of this width, or null when the row gives one column and the cards fill it.
export function twoColumnWidth(rowWidth: number, gap: number): number | null {
  return 2 * Math.max(rowWidth * TWO_COLUMN_SHARE, MIN_CARD_WIDTH) + gap <= rowWidth ? (rowWidth - gap) / 2 : null;
}
