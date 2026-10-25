import { t } from '../../../core/i18n';
import { Button } from '../../../core/ui';
import '../i18n';

export type ArrivalButtonProps = {
  onArrival: () => void;
};

export function ArrivalButton({ onArrival }: ArrivalButtonProps) {
  return <Button size="timing" label={t('timing.series.arrival')} onPress={onArrival} />;
}
