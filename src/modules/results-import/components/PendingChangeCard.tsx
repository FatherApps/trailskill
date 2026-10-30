import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import type { Hundredths } from '../../../core/time';
import { Banner, Button, TimeValue } from '../../../core/ui';
import '../i18n';

export type PendingChangeCardProps = {
  event: string;
  date: string;
  // The value imported before, which stays on screen until the guardian chooses.
  current: Hundredths | null;
  proposed: Hundredths | null;
  busy: boolean;
  // The last choice could not be saved; nothing changed.
  failed: boolean;
  onUseNew: () => void;
  onKeepCurrent: () => void;
};

// Presentational: the difference at the source and the two ways to answer it.
export function PendingChangeCard({ event, date, current, proposed, busy, failed, onUseNew, onKeepCurrent }: PendingChangeCardProps) {
  const { colors, space, radius, typography } = useTheme();

  return (
    <View style={{ gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: colors['surface-1'] }}>
      <View>
        <Text style={[typography['body-strong'], { color: colors.ink }]}>{event}</Text>
        {date !== '' && <Text style={[typography.body, { color: colors['ink-muted'] }]}>{date}</Text>}
      </View>
      <View style={{ flexDirection: 'row', gap: space[4] }}>
        <View accessible accessibilityLabel={t('results_import.update.changes.current')}>
          <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('results_import.update.changes.current')}</Text>
          <TimeValue value={current} size="time-md" />
        </View>
        <View accessible accessibilityLabel={t('results_import.update.changes.proposed')}>
          <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('results_import.update.changes.proposed')}</Text>
          <TimeValue value={proposed} size="time-md" />
        </View>
      </View>
      {failed && <Banner variant="warn" icon="error">{t('results_import.update.changes.failed')}</Banner>}
      <View style={{ gap: space[2] }}>
        <Button label={t('results_import.update.changes.use_new')} onPress={onUseNew} loading={busy} variant="secondary" />
        <Button label={t('results_import.update.changes.keep_current')} onPress={onKeepCurrent} loading={busy} variant="ghost" />
      </View>
    </View>
  );
}
