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
  type SharingRequest,
} from '../components/AuthorizationList';
import { SectionFrame, type SectionView } from '../components/SectionFrame';
import type { ConsoleSectionProps } from './ConsoleScreen';

export type AuthorizationsContent = {
  // Minutes since the data was updated; `null` when it is not known.
  updatedMinutesAgo: number | null;
  athletes: AthleteAuthorizations[];
  // Other schools asking to see this school's results, pending or approved; null while not available (offline or the read failed).
  sharingRequests: SharingRequest[] | null;
};

export type AuthorizationsView = SectionView<AuthorizationsContent>;

export type AuthorizationsScreenProps = ConsoleSectionProps & {
  view: AuthorizationsView;
  // Both fire only after the ConfirmSheet is confirmed; the real sending and approval belong to the caller.
  onResend: (athleteId: string, purpose: AuthorizationPurpose) => void;
  onApproveSharing: (requestId: string) => void;
  onWithdrawSharing: (requestId: string) => void;
  // Why the last action failed, shown above the list; null or absent when nothing failed.
  resendError?: string | null;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

// The sheet that is open: re-sending a purpose to an athlete's guardian, approving another school's request, or withdrawing an approved one.
type Pending = { kind: 'resend'; athleteId: string; purpose: AuthorizationPurpose } | { kind: 'approve'; requestId: string } | { kind: 'withdraw'; requestId: string };

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
export function AuthorizationsScreen({ width, schoolName, view, onNavigate, onResend, onApproveSharing, onWithdrawSharing, resendError, scrollEnabled }: AuthorizationsScreenProps) {
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
  } else if (pending?.kind === 'withdraw') {
    const request = content?.sharingRequests?.find((row) => row.id === pending.requestId);
    if (request) {
      sheet = (
        <ConfirmSheet
          visible
          title={t('schoolConsole.authorizations.withdraw_confirm.title', { school: request.school })}
          message={t('schoolConsole.authorizations.withdraw_confirm.message', { school: request.school })}
          confirmLabel={t('schoolConsole.authorizations.withdraw_confirm.confirm')}
          cancelLabel={t('schoolConsole.authorizations.cancel')}
          onConfirm={() => {
            close();
            onWithdrawSharing(request.id);
          }}
          onCancel={close}
        />
      );
    }
  } else if (pending?.kind === 'approve') {
    const request = content?.sharingRequests?.find((row) => row.id === pending.requestId);
    if (request) {
      sheet = (
        <ConfirmSheet
          visible
          title={t('schoolConsole.authorizations.approve_confirm.title', { school: request.school })}
          message={t('schoolConsole.authorizations.approve_confirm.message', { school: request.school })}
          confirmLabel={t('schoolConsole.authorizations.approve_confirm.confirm')}
          cancelLabel={t('schoolConsole.authorizations.cancel')}
          onConfirm={() => {
            close();
            onApproveSharing(request.id);
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
      {({ athletes, sharingRequests }) => (
        <>
          {resendError ? <Banner variant="warn" icon="error">{resendError}</Banner> : null}
          {(sharingRequests === null || sharingRequests.length > 0) && (
            <SharingRequestList
              requests={sharingRequests}
              onApprove={(requestId) => setPending({ kind: 'approve', requestId })}
              onWithdraw={(requestId) => setPending({ kind: 'withdraw', requestId })}
            />
          )}
          <AuthorizationList athletes={athletes} onResend={(athleteId, purpose) => setPending({ kind: 'resend', athleteId, purpose })} />
        </>
      )}
    </SectionFrame>
  );
}
