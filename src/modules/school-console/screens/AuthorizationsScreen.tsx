import { useState } from 'react';

import { t } from '../../../core/i18n';
import { Banner, ConfirmSheet } from '../../../core/ui';
import '../i18n';
import {
  AuthorizationList,
  purposeLabel,
  SharingRequestList,
  type AthleteAuthorizations,
  type AuthorizationPurpose,
  type SharingRequestsState,
} from '../components/AuthorizationList';
import { AnonymousCopyList, type AnonymousCopiesState } from '../components/AnonymousCopyList';
import { RelinkRequestList, relinkAthleteName, type RelinkRequestsState } from '../components/RelinkRequestList';
import { SectionFrame, type SectionView } from '../components/SectionFrame';
import type { ConsoleSectionProps } from './ConsoleScreen';

export type AuthorizationsContent = {
  // Minutes since the data was updated; `null` when it is not known.
  updatedMinutesAgo: number | null;
  athletes: AthleteAuthorizations[];
  // Other schools asking to see this school's results, pending or approved; otherwise why they are not shown: still loading, offline, or the online read failed.
  sharingRequests: SharingRequestsState;
  // Families asking this school for the times it kept of an erased swimmer (issue 1251). Absent: the area is not shown.
  relinkRequests?: RelinkRequestsState;
  // The anonymous swimmers of this school (issue 1420). Absent: the area is not shown.
  anonymousCopies?: AnonymousCopiesState;
};

export type AuthorizationsView = SectionView<AuthorizationsContent>;

export type AuthorizationsScreenProps = ConsoleSectionProps & {
  view: AuthorizationsView;
  // Both fire only after the ConfirmSheet is confirmed; the real sending and approval belong to the caller.
  onResend: (athleteId: string, purpose: AuthorizationPurpose) => void;
  onApproveSharing: (requestId: string) => void;
  // Withdraws an approved request or rejects a pending one: the server call is the same.
  onWithdrawSharing: (requestId: string) => void;
  // Reads the requests again after a failed read.
  onRetrySharingRequests: () => void;
  // Approves or rejects a relink request; fires only after the ConfirmSheet is confirmed.
  onResolveRelink?: (requestId: string, approve: boolean) => void;
  onRetryRelink?: () => void;
  onRetryAnonymousCopies?: () => void;
  // Why the last action failed, shown above the list; null or absent when nothing failed.
  resendError?: string | null;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

type RequestAction = 'approve' | 'withdraw' | 'reject';

// The sheet that is open: re-sending a purpose to an athlete's guardian, or approving, withdrawing or rejecting another school's request.
type Pending =
  | { kind: 'resend'; athleteId: string; purpose: AuthorizationPurpose }
  | { kind: RequestAction; requestId: string }
  | { kind: 'relink_approve' | 'relink_reject'; requestId: string };

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
export function AuthorizationsScreen({
  width,
  schoolName,
  view,
  onNavigate,
  onResend,
  onApproveSharing,
  onWithdrawSharing,
  onRetrySharingRequests,
  onResolveRelink,
  onRetryRelink,
  onRetryAnonymousCopies,
  resendError,
  scrollEnabled,
}: AuthorizationsScreenProps) {
  const [pending, setPending] = useState<Pending | null>(null);

  const content = view.kind === 'data' || view.kind === 'offline' ? view.content : null;
  const close = () => setPending(null);

  let sheet = null;
  if (pending?.kind === 'resend') {
    const athlete = content?.athletes.find((row) => row.id === pending.athleteId);
    if (athlete) {
      sheet = (
        <ConfirmSheet
          visible
          title={t('schoolConsole.authorizations.resend_confirm.title')}
          message={
            athlete.guardian === null
              ? t('schoolConsole.authorizations.resend_confirm.message_no_guardian', { purpose: purposeLabel(pending.purpose), athlete: athlete.athlete })
              : t('schoolConsole.authorizations.resend_confirm.message', {
                  guardian: athlete.guardian,
                  purpose: purposeLabel(pending.purpose),
                  athlete: athlete.athlete,
                })
          }
          confirmLabel={t('schoolConsole.authorizations.resend_confirm.confirm')}
          cancelLabel={t('schoolConsole.authorizations.cancel')}
          onConfirm={() => {
            close();
            onResend(athlete.id, pending.purpose);
          }}
          onCancel={close}
        />
      );
    }
  } else if (pending?.kind === 'relink_approve' || pending?.kind === 'relink_reject') {
    const relinks = Array.isArray(content?.relinkRequests) ? content.relinkRequests : [];
    const request = relinks.find((row) => row.id === pending.requestId);
    if (request) {
      const prefix = `schoolConsole.authorizations.relink.${pending.kind === 'relink_approve' ? 'approve' : 'reject'}_confirm`;
      const athlete = relinkAthleteName(request);
      sheet = (
        <ConfirmSheet
          visible
          title={t(`${prefix}.title`, { athlete })}
          message={t(`${prefix}.message`, { athlete })}
          confirmLabel={t(`${prefix}.confirm`)}
          cancelLabel={t('schoolConsole.authorizations.cancel')}
          onConfirm={() => {
            close();
            onResolveRelink?.(request.id, pending.kind === 'relink_approve');
          }}
          onCancel={close}
        />
      );
    }
  } else if (pending) {
    const requests = Array.isArray(content?.sharingRequests) ? content.sharingRequests : [];
    const request = requests.find((row) => row.id === pending.requestId);
    if (request) {
      const prefix = `schoolConsole.authorizations.${pending.kind}_confirm`;
      sheet = (
        <ConfirmSheet
          visible
          title={t(`${prefix}.title`, { school: request.school })}
          message={t(`${prefix}.message`, { school: request.school })}
          confirmLabel={t(`${prefix}.confirm`)}
          cancelLabel={t('schoolConsole.authorizations.cancel')}
          onConfirm={() => {
            close();
            (pending.kind === 'approve' ? onApproveSharing : onWithdrawSharing)(request.id);
          }}
          onCancel={close}
        />
      );
    }
  }

  return (
    <SectionFrame
      section="authorizations"
      width={width}
      schoolName={schoolName}
      view={view}
      onNavigate={onNavigate}
      scrollEnabled={scrollEnabled}
      summary={({ athletes, updatedMinutesAgo }) => {
        const withPending = athletes.filter((row) => Object.values(row.purposes).includes('pending')).length;
        const count = t('schoolConsole.authorizations.count', { count: athletes.length });
        return {
          count: withPending > 0 ? `${count} · ${t('schoolConsole.authorizations.pending', { count: withPending })}` : count,
          updatedMinutesAgo,
        };
      }}
      overlay={sheet}
    >
      {({ athletes, sharingRequests, relinkRequests, anonymousCopies }) => (
        <>
          {resendError ? <Banner variant="warn" icon="error">{resendError}</Banner> : null}
          {relinkRequests !== undefined && relinkRequests !== 'loading' && !(Array.isArray(relinkRequests) && relinkRequests.length === 0) && (
            <RelinkRequestList
              requests={relinkRequests}
              onApprove={(requestId) => setPending({ kind: 'relink_approve', requestId })}
              onReject={(requestId) => setPending({ kind: 'relink_reject', requestId })}
              onRetry={() => onRetryRelink?.()}
            />
          )}
          {anonymousCopies !== undefined && anonymousCopies !== 'loading' && !(Array.isArray(anonymousCopies) && anonymousCopies.length === 0) && (
            <AnonymousCopyList copies={anonymousCopies} onRetry={() => onRetryAnonymousCopies?.()} />
          )}
          {sharingRequests !== 'loading' && !(Array.isArray(sharingRequests) && sharingRequests.length === 0) && (
            <SharingRequestList
              requests={sharingRequests}
              onApprove={(requestId) => setPending({ kind: 'approve', requestId })}
              onWithdraw={(requestId) => setPending({ kind: 'withdraw', requestId })}
              onReject={(requestId) => setPending({ kind: 'reject', requestId })}
              onRetry={onRetrySharingRequests}
            />
          )}
          <AuthorizationList athletes={athletes} onResend={(athleteId, purpose) => setPending({ kind: 'resend', athleteId, purpose })} />
        </>
      )}
    </SectionFrame>
  );
}
