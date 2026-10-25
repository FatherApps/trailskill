import { useEffect, useState } from 'react';
import { Share } from 'react-native';

import { t } from '../../../core/i18n';
import type { SyncConnection } from '../../../core/sync';
import '../i18n';
import { formatDate, localDate } from '../components/formatDate';
import type { AuthorizationsRepository, ConsoleAuthorizationRow } from '../data/authorizations';
import type { ConsoleSectionProps } from './ConsoleScreen';
import { AuthorizationsScreen, type AuthorizationsContent, type AuthorizationsView } from './AuthorizationsScreen';

export type AuthorizationsSectionProps = ConsoleSectionProps & {
  schoolId: string;
  repository: AuthorizationsRepository;
  // The list is read again when this changes (a sync completed).
  refreshKey?: unknown;
  // When the local database last finished a sync; `null` when it never did.
  lastSyncedAt: Date | null;
  connection: SyncConnection;
  // The clock. A stable function.
  now?: () => Date;
  // Opens the system share sheet with the invitation message; replaced in tests.
  share?: (message: string) => Promise<unknown>;
};

// The answer is stored with what it answers, so another school or a retry never inherits it while its own read runs.
type Answer = {
  schoolId: string;
  attempt: number;
  result: ConsoleAuthorizationRow[] | 'error';
};

const defaultNow = () => new Date();
const defaultShare = (message: string) => Share.share({ message });
const MINUTE_MS = 60_000;

// The authorizations of the school's athletes, read from the local database. Re-sending creates a new invitation and shares it.
export function AuthorizationsSection({
  width,
  schoolName,
  onNavigate,
  schoolId,
  repository,
  refreshKey,
  lastSyncedAt,
  connection,
  now = defaultNow,
  share = defaultShare,
}: AuthorizationsSectionProps) {
  const [answer, setAnswer] = useState<Answer>();
  const [attempt, setAttempt] = useState(0);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const settle = (result: Answer['result']) => active && setAnswer({ schoolId, attempt, result });
    repository.listAthletes(schoolId).then(settle, () => settle('error'));
    return () => {
      active = false;
    };
  }, [repository, schoolId, refreshKey, attempt]);

  const loaded = answer?.schoolId === schoolId && answer.attempt === attempt ? answer.result : undefined;
  const rows = loaded === undefined || loaded === 'error' ? undefined : loaded;

  let view: AuthorizationsView;
  // Empty before the first sync arrives is not "no athletes": the data may still be on its way.
  if (loaded === undefined || (connection === 'connecting' && lastSyncedAt === null && rows?.length === 0)) {
    view = { kind: 'loading' };
  } else if (rows === undefined) {
    view = { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  } else if (rows.length === 0) {
    view = connection === 'offline' && lastSyncedAt === null ? { kind: 'offline-empty' } : { kind: 'empty' };
  } else {
    const content: AuthorizationsContent = {
      updatedMinutesAgo: lastSyncedAt ? Math.max(0, Math.floor((now().getTime() - lastSyncedAt.getTime()) / MINUTE_MS)) : null,
      // Guardians are not readable by school admins yet (issue 220): never a guess.
      athletes: rows.map(({ groupId, ...row }) => ({
        ...row,
        guardian: null,
        canResend: groupId !== null,
      })),
      // Approving another school is not available yet: its data model is still to be decided.
      sharingRequests: null,
    };
    view =
      connection !== 'offline'
        ? { kind: 'data', content }
        : {
            kind: 'offline',
            storedOn: lastSyncedAt ? localDate(lastSyncedAt) : '',
            content,
          };
  }

  const resend = async (athleteId: string) => {
    const groupId = rows?.find((row) => row.id === athleteId)?.groupId;
    if (!groupId) return;
    setResendError(null);
    let message: string;
    try {
      const invitation = await repository.resend(schoolId, groupId);
      message = t('schoolConsole.authorizations.share_message', {
        school: schoolName,
        token: invitation.token,
        date: formatDate(localDate(new Date(invitation.expiresAt)), 'long') ?? '',
      });
    } catch {
      return setResendError(t('schoolConsole.authorizations.resend_error'));
    }
    // Closing the share sheet without sending is the admin's choice, not a failure: the invitation stays valid.
    await share(message).catch(() => undefined);
  };

  return (
    <AuthorizationsScreen
      width={width}
      schoolName={schoolName}
      view={view}
      onNavigate={onNavigate}
      onResend={(athleteId) => void resend(athleteId)}
      onApproveSharing={() => {}}
      resendError={resendError}
    />
  );
}
