import { StyleSheet, Text, View } from 'react-native';

import { namedText, t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button } from '../../../core/ui';
import '../i18n';

export type ImportPromptProps = {
  // The import provider's name, from data (the provider's `organizations` row). Absent or empty: no provider is
  // configured and nothing is shown.
  sourceName?: string;
  athleteName: string;
  // Before the first import it asks; afterwards it offers a manual refresh.
  imported: boolean;
  onDismiss: () => void;
  onRefresh: () => void;
  // Only before the first import.
  onLearnMore?: () => void;
  // Only before the first import: starts the search of the athlete's history at the source.
  onStart?: () => void;
  // Opens the import of one tournament by its address. Offered by itself when no federation is configured.
  onStartTournament?: () => void;
};

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});

// Presentational: whether the viewer may see it (guardians and adults only) is decided by the screen.
export function ImportPrompt({
  sourceName,
  athleteName,
  imported,
  onDismiss,
  onRefresh,
  onLearnMore,
  onStart,
  onStartTournament,
}: ImportPromptProps) {
  const { space, typography } = useTheme();

  if (!sourceName && !onStartTournament) return null;

  const values = { source: sourceName ?? '' };

  return (
    <View style={{ alignSelf: 'stretch', gap: space[2] }}>
      <Banner variant="info" icon={imported && sourceName ? 'cloud_done' : 'cloud_download'}>
        {!sourceName ? (
          t('athletes.import_prompt.tournament_offer')
        ) : imported ? (
          namedText('athletes.import_prompt.imported', athleteName, values)
        ) : (
          <>
            <Text style={typography['body-strong']}>
              {namedText('athletes.import_prompt.question', athleteName, values)}
            </Text>{' '}
            {t('athletes.import_prompt.offer', values)}
          </>
        )}
      </Banner>
      <View style={[styles.actions, { gap: space[2] }]}>
        {imported && sourceName && (
          <Button variant="secondary" label={t('athletes.import_prompt.refresh', values)} onPress={onRefresh} />
        )}
        {!imported && sourceName && onStart && <Button variant="secondary" label={t('athletes.import_prompt.start', values)} onPress={onStart} />}
        {onStartTournament && <Button variant="secondary" label={t('athletes.import_prompt.tournament')} onPress={onStartTournament} />}
        <Button variant="ghost" label={t('athletes.import_prompt.dismiss')} onPress={onDismiss} />
        {!imported && sourceName && onLearnMore && (
          <Button variant="ghost" label={t('athletes.import_prompt.learn_more')} onPress={onLearnMore} />
        )}
      </View>
    </View>
  );
}
