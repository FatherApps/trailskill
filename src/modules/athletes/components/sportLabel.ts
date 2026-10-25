import { t } from '../../../core/i18n';
import { distances, pools, strokes } from '../../../core/sport';
import '../i18n';

type Catalog = readonly { code: string; nameKey: string }[];

// The label of a catalog entry; an unknown code stays visible as the code itself.
function label(catalog: Catalog, code: string): string {
  const entry = catalog.find((item) => item.code === code);
  return entry ? t(entry.nameKey) : code;
}

export const strokeLabel = (code: string) => label(strokes, code);
export const distanceLabel = (code: string) => label(distances, code);
export const poolLabel = (code: string) => label(pools, code);
