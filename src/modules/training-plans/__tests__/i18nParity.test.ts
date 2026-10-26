import fs from 'node:fs';
import path from 'node:path';

const i18nDir = path.join(__dirname, '..', 'i18n');
const locales = fs.readdirSync(i18nDir).filter((file) => file.endsWith('.json'));

// Variants the screen picks by data (name, summary) and plural forms: a missing one drops data from the label without warning.
// shortcut: plural forms are `_one` and `_other`, enough for es; a language with more categories extends this list.
const plurals = ['summary_partial', 'summary_blocks'].flatMap((key) => [`${key}_one`, `${key}_other`]);
const keys = ['heading_name', 'heading_summary', 'heading_name_summary', ...plurals];

describe('training-plans today summary and heading keys', () => {
  it('finds at least one locale', () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it.each(locales)('%s has every heading and summary key', (locale) => {
    const today = JSON.parse(fs.readFileSync(path.join(i18nDir, locale), 'utf8')).today as Record<string, string>;

    expect(keys.filter((key) => !today[key])).toEqual([]);
  });
});
