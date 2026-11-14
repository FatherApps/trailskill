import { t } from '../../../core/i18n';
import '../i18n';

const named = new Set([24, 25, 164, 79, 85, 87, 88, 66, 62, 92, 93]);

/** A key as people know it: "Subir volumen (+)", or "Tecla 131" for one without a name. */
export const keyName = (keyCode: number): string =>
  named.has(keyCode) ? t(`timing.button.key.${keyCode}`) : t('timing.button.key.other', { code: keyCode });

/** What the timing keys do on the stopwatch, and which pulsador is connected, as one line under the clock. */
export function stopwatchButtonsHint(startKey: number, splitKey: number, device?: string): string {
  const keys =
    startKey === splitKey
      ? t('timing.button.hint_stopwatch_start_only', { start: keyName(startKey) })
      : t('timing.button.hint_stopwatch', { start: keyName(startKey), split: keyName(splitKey) });
  return device ? `${t('timing.button.connected', { device })} · ${keys}` : keys;
}

/** In a series either timing key is the arrival button. */
export function arrivalButtonsHint(startKey: number, splitKey: number, device?: string): string {
  const keys =
    startKey === splitKey
      ? t('timing.button.hint_arrival', { keys: keyName(startKey) })
      : t('timing.button.hint_arrival_two', { first: keyName(startKey), second: keyName(splitKey) });
  return device ? `${t('timing.button.connected', { device })} · ${keys}` : keys;
}
