import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, ColorHeader, StateView, TextField } from '../../../core/ui';
import type { SearchCandidate } from '../data/officialSearch';
import '../i18n';

export type NumberHint = { present: boolean; lastThree: string | null };

export type ConfirmPersonView =
  | { kind: 'loading' }
  | { kind: 'loading_error'; onRetry: () => void }
  | { kind: 'unauthorized'; athleteName: string; onGoToAuthorizations: () => void }
  | { kind: 'offline' }
  | { kind: 'unavailable' }
  | { kind: 'rate_limited'; time: string }
  | {
      kind: 'start';
      athleteName: string;
      sourceName: string;
      hint: NumberHint;
      // What is being typed; held in memory only and shown as dots.
      number: string;
      numberInvalid: boolean;
      busy: boolean;
      message?: string;
      onChangeNumber: (text: string) => void;
      onSearchStored: () => void;
      onSaveAndSearch: () => void;
      onSearchByName: () => void;
    }
  | {
      kind: 'candidates';
      athleteName: string;
      sourceName: string;
      candidates: SearchCandidate[];
      confirmingId: string | null;
      onConfirm: (candidateId: string) => void;
      onNone: () => void;
    }
  | { kind: 'empty'; athleteName: string; sourceName: string; onRetry: () => void }
  | { kind: 'confirmed'; athleteName: string; sourceName: string; onDone: () => void };

export type ConfirmPersonScreenProps = { view: ConfirmPersonView; onBack: () => void };

const affiliationLine = ({ club, league }: SearchCandidate['affiliations'][number]) =>
  club && league ? t('results_import.candidates.club_and_league', { club, league }) : (club ?? league);

// Presentational: no network, database or repository; the container supplies everything and handles the events.
export function ConfirmPersonScreen({ view, onBack }: ConfirmPersonScreenProps) {
  const { colors, space, typography } = useTheme();
  const padded = { paddingHorizontal: space[4], paddingVertical: space[4], gap: space[3] };
  const frame = (title: string, children: React.ReactNode) => (
    <View style={{ alignSelf: 'stretch', flex: 1 }}>
      <ColorHeader color="sky" title={title} onBack={onBack} />
      <ScrollView contentContainerStyle={padded}>{children}</ScrollView>
    </View>
  );
  const state = (title: string, node: React.ReactNode) => frame(title, node);

  switch (view.kind) {
    case 'loading':
      return frame(t('results_import.start.title'), <StateView kind="loading" />);
    case 'loading_error':
      return state(
        t('results_import.start.title'),
        <StateView
          kind="error"
          title={t('results_import.loading_error.title')}
          message={t('results_import.loading_error.message')}
          action={{ label: t('results_import.loading_error.action'), onPress: view.onRetry }}
        />,
      );
    case 'unauthorized':
      return state(
        t('results_import.start.title'),
        <StateView
          kind="denied"
          title={t('results_import.unauthorized.title')}
          message={t('results_import.unauthorized.message', { name: view.athleteName })}
          action={{ label: t('results_import.unauthorized.action'), onPress: view.onGoToAuthorizations }}
        />,
      );
    case 'offline':
      return state(
        t('results_import.start.title'),
        <StateView
          kind="offline"
          title={t('results_import.offline.title')}
          message={t('results_import.offline.message')}
        />,
      );
    case 'unavailable':
      return state(
        t('results_import.start.title'),
        <StateView
          kind="error"
          title={t('results_import.unavailable.title')}
          message={t('results_import.unavailable.message')}
        />,
      );
    case 'rate_limited':
      return state(
        t('results_import.start.title'),
        <StateView
          kind="empty"
          icon="timer"
          title={t('results_import.rate_limited.title')}
          message={t('results_import.rate_limited.message', { time: view.time })}
        />,
      );
    case 'empty':
      return state(
        t('results_import.candidates.title'),
        <StateView
          kind="empty"
          title={t('results_import.empty.title')}
          message={t('results_import.empty.message', { source: view.sourceName, name: view.athleteName })}
          action={{ label: t('results_import.empty.action'), onPress: view.onRetry }}
        />,
      );
    case 'confirmed':
      return state(
        t('results_import.start.title'),
        <StateView
          kind="empty"
          icon="check_circle"
          title={t('results_import.confirmed.title')}
          message={t('results_import.confirmed.message', { source: view.sourceName, name: view.athleteName })}
          action={{ label: t('results_import.confirmed.action'), onPress: view.onDone }}
        />,
      );
    case 'candidates':
      return frame(
        t('results_import.candidates.title'),
        <>
          <Text style={[typography.body, { color: colors.ink }]}>
            {t('results_import.candidates.intro', { source: view.sourceName, name: view.athleteName })}
          </Text>
          <Banner variant="info" icon="info">
            {t('results_import.candidates.affiliation_note')}
          </Banner>
          {view.candidates.map((candidate) => (
            <View
              key={candidate.id}
              style={{ backgroundColor: colors['surface-1'], padding: space[3], gap: space[2], borderWidth: 1, borderColor: colors['border-strong'] }}
            >
              <Text style={[typography['body-strong'], { color: colors.ink }]}>{candidate.name}</Text>
              {candidate.affiliations.length === 0 ? (
                <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('results_import.candidates.no_affiliation')}</Text>
              ) : (
                candidate.affiliations.map((affiliation, index) => (
                  <View key={index}>
                    {affiliationLine(affiliation) && (
                      <Text style={[typography.body, { color: colors.ink }]}>{affiliationLine(affiliation)}</Text>
                    )}
                    {affiliation.years.length > 0 && (
                      <Text style={[typography.body, { color: colors['ink-muted'] }]}>
                        {t('results_import.candidates.years', { years: affiliation.years.join(', ') })}
                      </Text>
                    )}
                  </View>
                ))
              )}
              <Text style={[typography.body, { color: colors['ink-muted'] }]}>
                {t('results_import.candidates.results', { count: candidate.resultCount })}
              </Text>
              <Button
                label={t('results_import.candidates.confirm')}
                loading={view.confirmingId === candidate.id}
                loadingLabel={t('results_import.candidates.confirming')}
                onPress={() => view.onConfirm(candidate.id)}
              />
            </View>
          ))}
          <Button variant="ghost" label={t('results_import.candidates.none')} onPress={view.onNone} />
        </>,
      );
    case 'start':
      return frame(
        t('results_import.start.title'),
        <>
          <Text style={[typography.body, { color: colors.ink }]}>
            {t('results_import.start.intro', { name: view.athleteName, source: view.sourceName })}
          </Text>
          {view.message && <Banner variant="warn" icon="error">{view.message}</Banner>}
          {view.hint.present ? (
            <>
              <Text style={[typography.body, { color: colors.ink }]}>
                {view.hint.lastThree
                  ? t('results_import.start.number_saved_ending', { ending: view.hint.lastThree })
                  : t('results_import.start.number_saved')}
              </Text>
              <Button
                label={t('results_import.start.search_stored')}
                loading={view.busy}
                loadingLabel={t('results_import.start.searching')}
                onPress={view.onSearchStored}
              />
            </>
          ) : (
            <>
              <TextField
                label={t('results_import.start.number_label')}
                help={t('results_import.start.number_help')}
                error={view.numberInvalid ? t('results_import.start.number_invalid') : undefined}
                value={view.number}
                onChangeText={view.onChangeNumber}
                secureTextEntry
                autoCapitalize="characters"
                autoCorrect={false}
                // Room for the spaces, dots and hyphens that are removed before the 20-character limit.
                maxLength={40}
              />
              <Button
                label={t('results_import.start.save_and_search')}
                loading={view.busy}
                loadingLabel={t('results_import.start.searching')}
                onPress={view.onSaveAndSearch}
              />
              <Button variant="secondary" label={t('results_import.start.by_name')} onPress={view.onSearchByName} />
            </>
          )}
        </>,
      );
  }
}
