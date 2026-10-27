import { t } from '.';

// The one place that trims an athlete's name: a blank one is "", whoever shows it.
export const trimName = (name: string) => name.trim();

// The one place that picks between a text with the athlete's name and its `<key>_no_name` sibling for a blank name,
// so a text that shows the name cannot leave a gap in the sentence. `values` fills the other placeholders.
// Every key a call uses needs its `_no_name` sibling: `namedText.test.ts` walks the calls and fails when one is missing.
export function namedText(key: string, name: string, values: Record<string, string | number> = {}): string {
  const trimmed = trimName(name);
  return trimmed ? t(key, { ...values, name: trimmed }) : t(`${key}_no_name`, values);
}
