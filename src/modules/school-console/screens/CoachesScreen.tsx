import { useRef, useState } from 'react';

import { t } from '../../../core/i18n';
import { Banner, ConfirmSheet } from '../../../core/ui';
import '../i18n';
import { CoachList, type CoachRow } from '../components/CoachList';
import { InviteCoachSheet, type CoachInvitation, type InviteGroups } from '../components/InviteCoachSheet';
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
  // Fires when the invite sheet is confirmed with a name and an email; the real invitation belongs to the caller.
  // The sheet closes only once this resolves: it must reject (or throw) when the invitation fails, and then the sheet stays open with what was typed.
  onInvite: (invitation: CoachInvitation) => void | Promise<void>;
  // Fires only after the ConfirmSheet is confirmed; the real deactivation belongs to the caller.
  onDeactivate: (id: string) => void;
  // False (the default) until deactivating really works (issue 220): the action is shown disabled and opens nothing.
  deactivateAvailable?: boolean;
  // The groups of the school, offered as chips in the invite sheet; [] (the default) is a school with none, so the sheet asks only name and email.
  // 'loading' and 'error' say the groups are not known yet: the sheet shows that and does not send.
  groups?: InviteGroups;
  // Reads the groups again; the invite sheet offers it when they failed to load.
  onRetryGroups?: () => void;
  // The group an invitation link came from; its chip starts chosen.
  contextGroupId?: string;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

// The sheet that is open: inviting, or deactivating the coach with this id.
type Pending = { kind: 'invite'; opening: number } | { kind: 'deactivate'; id: string };

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
export function CoachesScreen({
  width,
  schoolName,
  view,
  onNavigate,
  onInvite,
  onDeactivate,
  deactivateAvailable = false,
  groups = [],
  onRetryGroups,
  contextGroupId,
  scrollEnabled,
}: CoachesScreenProps) {
  const [pending, setPending] = useState<Pending | null>(null);

  const content = view.kind === 'data' || view.kind === 'offline' ? view.content : null;
  const coach = pending?.kind === 'deactivate' ? content?.coaches.find((row) => row.id === pending.id) : undefined;
  // Counts the openings of the invite sheet, and moves on when it closes; an invitation settles only the opening it was sent from.
  // Closing the deactivate sheet does not touch it.
  const openings = useRef(0);
  const closeInvite = () => {
    openings.current += 1;
    setPending(null);
  };
  const closeDeactivate = () => setPending(null);
  // An invitation whose sheet was closed before it failed: nothing else would tell the person.
  const [lateFailure, setLateFailure] = useState(false);

  let sheet = null;
  if (pending?.kind === 'invite') {
    sheet = (
      <InviteCoachSheet
        key={pending.opening}
        groups={groups}
        initialGroupId={contextGroupId}
        onRetryGroups={onRetryGroups}
        onSubmit={async (invitation) => {
          const { opening } = pending;
          try {
            await onInvite(invitation);
          } catch (error) {
            // Only the kind of the error: its message can carry the invitee's email.
            if (__DEV__) console.warn('[school-console] The coach invitation could not be sent', error instanceof Error ? error.name : typeof error);
            if (opening === openings.current) throw error;
            setLateFailure(true);
            return;
          }
          if (opening === openings.current) closeInvite();
        }}
        onClose={closeInvite}
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
          closeDeactivate();
          onDeactivate(coach.id);
        }}
        onCancel={closeDeactivate}
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
      action={{ label: t('schoolConsole.coaches.invite'), icon: 'person_add', onPress: () => {
          setLateFailure(false);
          setPending({ kind: 'invite', opening: ++openings.current });
        },
      }}
      notice={
        lateFailure ? (
          <Banner variant="warn" icon="error">
            {t('schoolConsole.coaches.invite_sheet.failed')}
          </Banner>
        ) : undefined
      }
      overlay={sheet}
    >
      {({ coaches }) => <CoachList coaches={coaches} deactivateAvailable={deactivateAvailable} onDeactivate={(id) => setPending({ kind: 'deactivate', id })} />}
    </SectionFrame>
  );
}
