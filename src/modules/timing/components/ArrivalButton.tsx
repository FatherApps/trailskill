import { Pressable } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/ui';
import '../i18n';

export type ArrivalButtonProps = {
  onArrival: () => void;
};

// Button's timing size is 72 dp (88 only for stop). The outer target stretches the touch area to 88 without restyling Button.
export function ArrivalButton({ onArrival }: ArrivalButtonProps) {
  const { size } = useTheme();

  return (
    <Pressable
      testID="arrival-target"
      accessible={false}
      onPress={onArrival}
      style={{ minHeight: size['target-timing'], justifyContent: 'center' }}
    >
      <Button size="timing" label={t('timing.series.arrival')} onPress={onArrival} />
    </Pressable>
  );
}
