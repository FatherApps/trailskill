import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Banner, ColorHeader, StateView } from '../../../core/ui';
import '../i18n';
import { EventSelector, type EventSelectorProps } from '../components/EventSelector';
import { formatDate } from '../components/formatDate';
import { HistoryList, type HistoryResult } from '../components/HistoryList';
import { ImportPrompt, type ImportPromptProps } from '../components/ImportPrompt';
import { namedText, trimName } from '../components/namedText';
import { PersonalBest, type PersonalBestProps } from '../components/PersonalBest';
import { ProfileHeader, type ProfileHeaderProps } from '../components/ProfileHeader';
import { profileBandColor } from '../profileBandColor';

export type AthleteProfileContent = {
  header: ProfileHeaderProps;
  event: EventSelectorProps;
  personalBest: PersonalBestProps;
  // Newest first.
  history: HistoryResult[];
  // The progress chart (task 9.5) goes here; nothing is reserved when it is absent.
  chart?: ReactNode;
  // Only guardians and adults get it: the caller decides by passing it or not.
  importPrompt?: ImportPromptProps;
  // Another school's results are online only: set while offline to explain why none show, in place of them.
  otherSchoolOffline?: boolean;
  // Connected, but the server failed or did not answer: an error for this section only, with its own retry.
  otherSchoolError?: { onRetry: () => void };
};

// Which of the view states the caller is in. Only the states that show the profile carry its content.
export type AthleteProfileView =
  | { kind: 'data'; content: AthleteProfileContent }
  // No results yet: the header and selector stay, the personal best and history give way to an invitation.
  | { kind: 'empty'; content: AthleteProfileContent }
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void }
  // Offline with stored data: the content under a dated banner. `storedOn` is the ISO date (YYYY-MM-DD) it was saved.
  | { kind: 'offline'; storedOn: string; content: AthleteProfileContent }
  | { kind: 'offline-empty' }
  // Results from another school are online-only: never a stale copy.
  | { kind: 'other-school-offline' }
  | { kind: 'denied'; onRequestAccess?: () => void };

export type AthleteProfileScreenProps = {
  // The athlete's short name, the only personal data the states without content may show.
  name: string;
  view: AthleteProfileView;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
  // Where the band's back button goes in the states without content; the states with content take it from their header.
  onBack: () => void;
};

export const athleteProfileScreenColors: { title: ColorToken } = {
  title: 'ink',
};

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
export function AthleteProfileScreen({ name, view, scrollEnabled = true, onBack }: AthleteProfileScreenProps) {
  const { colors, space, typography } = useTheme();
  // The band title and the texts that carry the name share one trimmed value.
  const trimmed = trimName(name);
  // A list that scrolls fills the height it is given; the gallery preview has none to give.
  const frame = {
    alignSelf: 'stretch',
    flex: scrollEnabled ? 1 : undefined,
  } as const;
  // The one place of the screen margins: the band runs edge to edge, everything else keeps them.
  const margin = space[4];
  const padded = { paddingHorizontal: margin };
  // The states without content keep the band and its back button, so the screen never depends on the system back.
  const withBand = (state: ReactNode) => (
    <View style={frame}>
      {/* A blank name leaves the title empty on purpose (maintainer, issue 644): any placeholder would be new copy. */}
      <ColorHeader color={profileBandColor} title={trimmed} onBack={onBack} />
      {/* testID: this wrapper has no role, label or text; tests read its margin from it. */}
      <View testID="profile-content" style={[frame, padded, { paddingVertical: space[4] }]}>
        {state}
      </View>
    </View>
  );

  switch (view.kind) {
    case 'loading':
      return withBand(
        <StateView kind="loading" />
      );
    case 'error':
      return withBand(
        <StateView
          kind="error"
          title={t('athletes.screen.error.title')}
          message={t('athletes.screen.error.message')}
          action={{
            label: t('athletes.screen.retry'),
            onPress: view.onRetry,
          }}
        />
      );
    case 'offline-empty':
      return withBand(
        <StateView
          kind="offline"
          title={t('athletes.screen.offline.title')}
          message={namedText('athletes.screen.offline.message', trimmed)}
        />
      );
    case 'other-school-offline':
      return withBand(
        <StateView
          kind="offline"
          title={t('athletes.screen.online_only.title')}
          message={t('athletes.screen.online_only.message')}
        />
      );
    case 'denied':
      return withBand(
        <StateView
          kind="denied"
          title={t('athletes.screen.denied.title')}
          message={namedText('athletes.screen.denied.message', trimmed)}
          action={
            view.onRequestAccess
              ? {
                  label: t('athletes.screen.denied.action'),
                  onPress: view.onRequestAccess,
                }
              : undefined
          }
        />
      );
  }

  const { content } = view;
  const empty = view.kind === 'empty';
  const storedOn = view.kind === 'offline' ? formatDate(view.storedOn, 'long') : null;

  // The band runs edge to edge with the event chips inside it.
  const header = (
    <View style={{ gap: space[4] }}>
      <ProfileHeader {...content.header}>
        <EventSelector {...content.event} />
      </ProfileHeader>
      <View style={[padded, { gap: space[4] }]}>
        {view.kind === 'offline' && (
          <Banner variant="warn" icon="wifi_off">
            <Text style={typography['body-strong']}>{t('athletes.screen.offline.title')}</Text>{' '}
            {/* A malformed date is left out rather than shown wrong. */}
            {storedOn
              ? t('athletes.screen.offline.banner_dated', { date: storedOn })
              : t('athletes.screen.offline.banner_undated')}
          </Banner>
        )}
        {!empty && <PersonalBest {...content.personalBest} />}
        {!empty && content.chart}
        {!empty && content.history.length > 0 && (
          <Text
            accessibilityRole="header"
            style={[typography.subtitle, { color: colors[athleteProfileScreenColors.title] }]}
          >
            {t('athletes.screen.history_title')}
          </Text>
        )}
      </View>
    </View>
  );

  const footer =
    empty || content.importPrompt || content.otherSchoolOffline || content.otherSchoolError ? (
      <View style={[padded, { gap: space[4], paddingVertical: space[4] }]}>
        {empty && (
          <StateView
            kind="empty"
            title={t('athletes.screen.empty.title')}
            message={namedText('athletes.screen.empty.message', trimmed)}
          />
        )}
        {content.otherSchoolOffline && (
          <StateView
            kind="offline"
            title={t('athletes.screen.online_only.title')}
            message={t('athletes.screen.online_only.message')}
          />
        )}
        {content.otherSchoolError && (
          <StateView
            kind="error"
            title={t('athletes.screen.other_school_error.title')}
            message={t('athletes.screen.other_school_error.message')}
            action={{
              label: t('athletes.screen.retry'),
              onPress: content.otherSchoolError.onRetry,
            }}
          />
        )}
        {content.importPrompt && <ImportPrompt {...content.importPrompt} />}
      </View>
    ) : undefined;

  return (
    <View style={frame}>
      {/* One virtualized list holds the whole screen, so the history is never a list inside a ScrollView. */}
      <HistoryList
        results={empty ? [] : content.history}
        scrollEnabled={scrollEnabled}
        inset={margin}
        header={header}
        footer={footer}
      />
    </View>
  );
}
