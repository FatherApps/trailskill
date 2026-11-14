import { t } from '../../../core/i18n';
import '../i18n';

const named = new Set([24, 25, 164, 79, 85, 87, 88, 66, 62, 92, 93]);

/** A key as people know it: "Subir volumen (+)", or "Tecla 131" for one without a name. */
export const keyName = (keyCode: number): string =>
  named.has(keyCode) ? t(`timing.button.key.${keyCode}`) : t('timing.button.key.other', { code: keyCode });
