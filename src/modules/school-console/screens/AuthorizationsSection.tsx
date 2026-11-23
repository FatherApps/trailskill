import { useEffect, useRef, useState } from 'react';
import { Share } from 'react-native';

import { t } from '../../../core/i18n';
import type { SyncConnection } from '../../../core/sync';
import type { AthleteAvatarSlot } from '../../../core/ui';
import type { AthleteAnonymousCopyRepository, AthleteRelinkRepository } from '../../athletes';
import '../i18n';
import { avatarOf } from '../components/athleteAvatar';
import type { SharingRequest, SharingRequestsState } from '../components/AuthorizationList';
import type { AnonymousCopiesState } from '../components/AnonymousCopyList';
import type { RelinkRequestsState } from '../components/RelinkRequestList';
import { formatDate, localDate } from '../components/formatDate';
import type { AuthorizationsRepository, ConsoleAuthorizationRow } from '../data/authorizations';
import type { ConsoleSectionProps } from './ConsoleScreen';
import { AuthorizationsScreen, type AuthorizationsContent, type AuthorizationsView } from './AuthorizationsScreen';

export type AuthorizationsSectionProps = ConsoleSectionProps & {
  // Injected by the route (this module cannot read show_photo or the photo): the athletes' avatar with their photo. Absent: the initials.
  Avatar?: AthleteAvatarSlot;
  schoolId: string;
  repository: AuthorizationsRepository;
  // The relink requests of families (issue 1251), read and decided online through the athletes module. Absent: no inbox.
  relink?: AthleteRelinkRepository;
  // The school's anonymous swimmers (issue 1420), read online through the athletes module. Absent: no list.
  anonymousCopies?: Pick<AthleteAnonymousCopyRepository, 'list'>;
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

// The sharing requests are read online, apart from the athletes: a failure here never breaks the list.
type RequestsAnswer = { schoolId: string; result: SharingRequest[] | 'error' };
type RelinkAnswer = { schoolId: string; result: Exclude<RelinkRequestsState, 'loading' | 'offline'> };
type CopiesAnswer = { schoolId: string; result: Exclude<AnonymousCopiesState, 'loading' | 'offline'> };

const defaultNow = () => new Date();
const defaultShare = (message: string) => Share.share({ message });
const MINUTE_MS = 60_000;

// The authorizations of the school's athletes, read from the local database, and the sharing requests, read online. Re-sending creates a new invitation and shares it.
export function AuthorizationsSection({
  Avatar,
  width,
  schoolName,
  onNavigate,
  schoolId,
  repository,
  relink,
  anonymousCopies,
  refreshKey,
  lastSyncedAt,
  connection,
  now = defaultNow,
  share = defaultShare,
}: AuthorizationsSectionProps) {
  const [answer, setAnswer] = useState<Answer>();
  const [attempt, setAttempt] = useState(0);
  const [resendError, setResendError] = useState<string | null>(null);
  const [requestsAnswer, setRequestsAnswer] = useState<RequestsAnswer>();
  // Bumped after an approval or a withdrawal to read the requests again.
  const [requestsReload, setRequestsReload] = useState(0);
  const [relinkAnswer, setRelinkAnswer] = useState<RelinkAnswer>();
  const [relinkReload, setRelinkReload] = useState(0);
  const [copiesAnswer, setCopiesAnswer] = useState<CopiesAnswer>();
  const [copiesReload, setCopiesReload] = useState(0);
  // A ref, not state: a second confirmation can arrive before a re-render shows the first is running.
  const resending = useRef(false);
  const offline = connection === 'offline';

  useEffect(() => {
    let active = true;
    const settle = (result: Answer['result']) => active && setAnswer({ schoolId, attempt, result });
    repository.listAthletes(schoolId).then(settle, () => settle('error'));
    return () => {
      active = false;
    };
  }, [repository, schoolId, refreshKey, attempt]);

  useEffect(() => {
    if (offline) return;
    let active = true;
    const settle = (result: RequestsAnswer['result']) => active && setRequestsAnswer({ schoolId, result });
    repository.listSharingRequests(schoolId).then(settle, () => settle('error'));
    return () => {
      active = false;
    };
  }, [repository, schoolId, refreshKey, requestsReload, offline]);

  useEffect(() => {
    if (offline || !relink) return;
    let active = true;
    const settle = (result: RelinkAnswer['result']) => active && setRelinkAnswer({ schoolId, result });
    relink.listForSchool(schoolId).then(settle, () => settle('error'));
    return () => {
      active = false;
    };
  }, [relink, schoolId, refreshKey, relinkReload, offline]);

  useEffect(() => {
    if (offline || !anonymousCopies) return;
    let active = true;
    const settle = (result: CopiesAnswer['result']) => active && setCopiesAnswer({ schoolId, result });
    anonymousCopies.list(schoolId).then(settle, () => settle('error'));
    return () => {
      active = false;
    };
  }, [anonymousCopies, schoolId, refreshKey, copiesReload, offline]);

  // Never an empty list when the requests are not known: offline, another school's answer or still unread (loading), or a failed read.
  const answered = requestsAnswer?.schoolId === schoolId ? requestsAnswer.result : 'loading';
  const sharingRequests: SharingRequestsState = offline ? 'offline' : answered;

  const relinkAnswered = relinkAnswer?.schoolId === schoolId ? relinkAnswer.result : 'loading';
  const relinkRequests: RelinkRequestsState | undefined = !relink ? undefined : offline ? 'offline' : relinkAnswered;

  const copiesAnswered = copiesAnswer?.schoolId === schoolId ? copiesAnswer.result : 'loading';
  const copies: AnonymousCopiesState | undefined = !anonymousCopies ? undefined : offline ? 'offline' : copiesAnswered;

  const loaded = answer?.schoolId === schoolId && answer.attempt === attempt ? answer.result : undefined;
  const rows = loaded === undefined || loaded === 'error' ? undefined : loaded;

  let view: AuthorizationsView;
  if (loaded === undefined) {
    view = { kind: 'loading' };
  } else if (rows === undefined) {
    view = { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  } else if (rows.length === 0) {
    // Never synced and still not connected: nothing is stored yet, and the list fills in when the first sync arrives.
    // Never synced: 'connecting' is not 'offline', the first sync is already on its way.
    view =
      lastSyncedAt !== null || connection === 'connected'
        ? { kind: 'empty' }
        : connection === 'connecting'
          ? { kind: 'connecting-empty' }
          : { kind: 'offline-empty' };
  } else {
    const content: AuthorizationsContent = {
      updatedMinutesAgo: lastSyncedAt ? Math.max(0, Math.floor((now().getTime() - lastSyncedAt.getTime()) / MINUTE_MS)) : null,
      // Guardians are not readable by school admins yet (issue 220): never a guess.
      athletes: rows.map(({ groupId, ...row }) => ({
        ...row,
        avatar: avatarOf(Avatar, { id: row.id, initials: row.initials, color: row.color }),
        guardian: null,
        canResend: groupId !== null,
      })),
      sharingRequests,
      relinkRequests,
      anonymousCopies: copies,
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
    if (!groupId || resending.current) return;
    resending.current = true;
    setResendError(null);
    try {
      let message: string;
      try {
        const invitation = await repository.resend(schoolId, groupId);
        // A date that cannot be read drops the expiry sentence instead of leaving it blank.
        const date = formatDate(localDate(new Date(invitation.expiresAt)), 'long');
        message = t(date === null ? 'schoolConsole.authorizations.share_message_no_date' : 'schoolConsole.authorizations.share_message', {
          school: schoolName,
          token: invitation.token,
          date: date ?? '',
        });
      } catch {
        return setResendError(t('schoolConsole.authorizations.resend_error'));
      }
      // Closing the share sheet without sending is the admin's choice, not a failure: the invitation stays valid.
      await share(message).catch(() => undefined);
    } finally {
      resending.current = false;
    }
  };

  const changeSharing = async (action: 'approveSharing' | 'withdrawSharing', id: string) => {
    setResendError(null);
    try {
      await repository[action](id);
    } catch {
      setResendError(t('schoolConsole.authorizations.sharing_error'));
    }
    // Also after a failure: the request may have changed on the server.
    setRequestsReload((n) => n + 1);
  };

  const resolveRelink = async (requestId: string, approve: boolean) => {
    setResendError(null);
    try {
      const status = (await relink?.resolve(requestId, approve))?.status;
      if (status === 'already_resolved') setResendError(t('schoolConsole.authorizations.relink.resolved_elsewhere'));
      if (status === 'no_longer_valid') setResendError(t('schoolConsole.authorizations.relink.no_longer_valid'));
    } catch {
      setResendError(t('schoolConsole.authorizations.relink.action_error'));
    }
    // Also after a failure: the request may have changed on the server.
    setRelinkReload((n) => n + 1);
  };

  return (
    <AuthorizationsScreen
      width={width}
      schoolName={schoolName}
      view={view}
      onNavigate={onNavigate}
      onResend={(athleteId) => void resend(athleteId)}
      onApproveSharing={(id) => void changeSharing('approveSharing', id)}
      onWithdrawSharing={(id) => void changeSharing('withdrawSharing', id)}
      onRetrySharingRequests={() => {
        setRequestsAnswer(undefined);
        setRequestsReload((n) => n + 1);
      }}
      onResolveRelink={(requestId, approve) => void resolveRelink(requestId, approve)}
      onRetryRelink={() => {
        setRelinkAnswer(undefined);
        setRelinkReload((n) => n + 1);
      }}
      onRetryAnonymousCopies={() => {
        setCopiesAnswer(undefined);
        setCopiesReload((n) => n + 1);
      }}
      resendError={resendError}
    />
  );
}
