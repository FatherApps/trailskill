import type { VocabularyOption } from './types';

// An unknown value falls back to itself, so a catalog that drifts never crashes a screen.
export function labelOf(options: VocabularyOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
