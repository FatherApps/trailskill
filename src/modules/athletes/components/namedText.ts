import { t } from '../../../core/i18n';

// The one place that picks between a text with the athlete's name and its `<key>_no_name` sibling for a blank name,
// so a text that shows the name cannot leave a gap in the sentence. `values` fills the other placeholders.
export function namedText(key: string, name: string, values: Record<string, string | number> = {}): string {
  const trimmed = name.trim();
  return trimmed ? t(key, { ...values, name: trimmed }) : t(`${key}_no_name`, values);
}
