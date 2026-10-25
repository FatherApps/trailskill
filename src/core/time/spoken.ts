import { t } from '../i18n';
import type { Hundredths } from './time';

// Spoken form of a time, built from translation keys (plurals via `count`): "1 minuto, 12 segundos con 40 centésimas".
// Zero parts are omitted; minutes and seconds are joined by `time.spoken.join`, hundredths follow by
// `time.spoken.with_hundredths`; a time of 0 is "0 centésimas".
export function spokenTime(value: Hundredths): string {
  const minutes = Math.floor(value / 6000);
  const seconds = Math.floor((value % 6000) / 100);
  const cents = value % 100;
  const minutesText = minutes > 0 ? t('time.spoken.minutes', { count: minutes }) : '';
  const secondsText = seconds > 0 ? t('time.spoken.seconds', { count: seconds }) : '';
  const centsText = t('time.spoken.hundredths', { count: cents });

  const whole =
    minutesText && secondsText
      ? t('time.spoken.join', { first: minutesText, second: secondsText })
      : minutesText || secondsText;
  if (!whole) return centsText;
  return cents > 0 ? t('time.spoken.with_hundredths', { time: whole, hundredths: centsText }) : whole;
}

// Time minus personal best: negative when faster. `null` when there is nothing to compare or no difference.
export function personalBestDifference(value: Hundredths | null, personalBest: Hundredths | null | undefined): number | null {
  if (value === null || typeof personalBest !== 'number' || value === personalBest) return null;
  return value - personalBest;
}

export function spokenDifference(difference: number): string {
  return t(difference < 0 ? 'time_value.delta_faster' : 'time_value.delta_slower', {
    time: spokenTime(Math.abs(difference)),
  });
}
