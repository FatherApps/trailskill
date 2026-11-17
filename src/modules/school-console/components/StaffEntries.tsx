import type { ReactNode } from 'react';
import { View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/ui';
import '../i18n';

export type StaffEntriesProps = {
  // Receives the route the home screen opens for the same entry.
  onOpen: (href: string) => void;
  // The sign-out, which belongs to another module: the caller supplies it.
  children?: ReactNode;
};

// The entries the home screen gives school staff, for the screens where staff now land instead of it. Presentational: it only reports the press.
export function StaffEntries({ onOpen, children }: StaffEntriesProps) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] }}>
      <Button label={t('home.timing')} onPress={() => onOpen('/timing')} />
      <Button label={t('home.timing_series')} onPress={() => onOpen('/timing?mode=series')} />
      <Button label={t('home.timing_completed')} onPress={() => onOpen('/timing?mode=completed')} />
      <Button label={t('home.plans')} onPress={() => onOpen('/plans')} />
      <Button label={t('home.review_conflicts')} onPress={() => onOpen('/review-conflicts')} />
      {children}
    </View>
  );
}
