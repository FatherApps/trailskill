import { useState } from 'react';

import { t } from '../../../core/i18n';
import { ConfirmSheet } from '../../../core/ui';
import '../i18n';
import { CoachList, type CoachRow } from '../components/CoachList';
import { SectionFrame, type SectionView } from '../components/SectionFrame';
import type { ConsoleSectionProps } from './ConsoleScreen';

export type CoachesContent = {
  // Minutes since the data was updated; `null` when it is not known.
  updatedMinutesAgo: number | null;
  coaches: CoachRow[];
};

export type CoachesView = SectionView<CoachesContent>;

export type CoachesScreenProps = ConsoleSectionProps & {
  view: CoachesView;
  // Both fire only after the ConfirmSheet is confirmed; the real invitation and deactivation belong to the caller.
  onInvite: () => void;
  onDeactivate: (id: string) => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

// The sheet that is open: inviting, or deactivating the coach with this id.
type Pending = { kind: 'invite' } | { kind: 'deactivate'; id: string };

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
export function CoachesScreen({ width, schoolName, view, onNavigate, onInvite, onDeactivate, scrollEnabled }: CoachesScreenProps) {
  const [pending, setPending] = useState<Pending | null>(null);

  const content = view.kind === 'data' || view.kind === 'offline' ? view.content : null;
  const coach = pending?.kind === 'deactivate' ? content?.coaches.find((row) => row.id === pending.id) : undefined;
  const close = () => setPending(null);

  let sheet = null;
  if (pending?.kind === 'invite') {
    sheet = (
      <ConfirmSheet
        visible
        title={t('schoolConsole.coaches.invite_confirm.title')}
        message={t('schoolConsole.coaches.invite_confirm.message')}
        confirmLabel={t('schoolConsole.coaches.invite_confirm.confirm')}
        cancelLabel={t('schoolConsole.coaches.cancel')}
        onConfirm={() => {
          close();
          onInvite();
        }}
        onCancel={close}
      />
    );
  } else if (coach) {
    const name = coach.name ?? t('schoolConsole.common.no_data');
    sheet = (
      <ConfirmSheet
        visible
        destructive
        title={t('schoolConsole.coaches.deactivate_confirm.title', { name })}
        message={t('schoolConsole.coaches.deactivate_confirm.message', { name })}
        confirmLabel={t('schoolConsole.coaches.deactivate_confirm.confirm')}
        cancelLabel={t('schoolConsole.coaches.cancel')}
        onConfirm={() => {
          close();
          onDeactivate(coach.id);
        }}
        onCancel={close}
      />
    );
  }

  return (
    <SectionFrame
      section="coaches"
      width={width}
      schoolName={schoolName}
      view={view}
      onNavigate={onNavigate}
      scrollEnabled={scrollEnabled}
      summary={({ coaches, updatedMinutesAgo }) => ({
        count: t('schoolConsole.coaches.count', { count: coaches.length }),
        updatedMinutesAgo,
      })}
      action={{ label: t('schoolConsole.coaches.invite'), icon: 'person_add', onPress: () => setPending({ kind: 'invite' }) }}
      overlay={sheet}
    >
      {({ coaches }) => <CoachList coaches={coaches} onDeactivate={(id) => setPending({ kind: 'deactivate', id })} />}
    </SectionFrame>
  );
}
