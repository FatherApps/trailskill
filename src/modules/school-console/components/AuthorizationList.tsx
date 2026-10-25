import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Button, SwimmerRow, Tag, type SwimmerRowProps, type TagProps } from '../../../core/ui';
import '../i18n';
import { formatDate } from './formatDate';

// What the school asks each guardian to authorize, one purpose at a time: one acceptance never implies another.
export type AuthorizationPurpose = 'record' | 'import' | 'share';
export type AuthorizationStatus = 'valid' | 'pending' | 'withdrawn';

export const authorizationPurposes: readonly AuthorizationPurpose[] = ['record', 'import', 'share'];

// The status of every purpose of one athlete. No document number, no birth date: the console never shows them.
export type AthleteAuthorizations = {
  id: string;
  // Full name.
  athlete: string;
  initials: string;
  color: SwimmerRowProps['color'];
  // Full name of the guardian the requests go to; null when the console cannot read it.
  guardian: string | null;
  purposes: Record<AuthorizationPurpose, AuthorizationStatus>;
  // False when a request cannot be sent again (the athlete has no group to invite to): no button.
  canResend: boolean;
};

// Another school asking to see this school's results; the administrator of this school approves it.
export type SharingRequest = {
  id: string;
  school: string;
  // ISO date (YYYY-MM-DD).
  requestedOn: string;
  // Pending waits for this school's administrator; approved can be withdrawn.
  status: 'pending' | 'approved';
};

export const purposeLabel = (purpose: AuthorizationPurpose) => t(`schoolConsole.authorizations.purposes.${purpose}`);

export const authorizationListColors: { background: ColorToken; divider: ColorToken; text: ColorToken; caption: ColorToken } = {
  background: 'surface-1',
  divider: 'border',
  text: 'ink',
  caption: 'ink-muted',
};

const statusTag: Record<AuthorizationStatus, Pick<TagProps, 'variant' | 'icon'> & { key: string }> = {
  valid: { variant: 'ok', icon: 'verified_user', key: 'schoolConsole.table.valid' },
  pending: { variant: 'warn', icon: 'schedule', key: 'schoolConsole.table.pending' },
  withdrawn: { variant: 'neutral', icon: 'close', key: 'schoolConsole.authorizations.withdrawn' },
};

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

export type AuthorizationListProps = {
  athletes: AthleteAuthorizations[];
  // Only reports the press: the confirmation and the sending belong to the caller.
  onResend: (athleteId: string, purpose: AuthorizationPurpose) => void;
};

// Status per athlete and purpose. A pending purpose can be asked again; a valid or withdrawn one cannot.
export function AuthorizationList({ athletes, onResend }: AuthorizationListProps) {
  const { colors, space, radius, typography } = useTheme();
  const noData = t('schoolConsole.common.no_data');

  return (
    <View testID="authorization-list" style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors[authorizationListColors.background] }}>
      {athletes.map((athlete, index) => (
        <View
          key={athlete.id}
          style={[
            { paddingBottom: space[3] },
            index < athletes.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors[authorizationListColors.divider] },
          ]}
        >
          <SwimmerRow
            name={athlete.athlete}
            initials={athlete.initials}
            color={athlete.color}
            detail={t('schoolConsole.authorizations.guardian', { name: athlete.guardian ?? noData })}
          />
          <View style={{ gap: space[1], paddingLeft: space[4], paddingRight: space[3] }}>
            {authorizationPurposes.map((purpose) => {
              const status = athlete.purposes[purpose];
              const tag = statusTag[status];
              const label = purposeLabel(purpose);
              return (
                <View key={purpose} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                  {/* The text and the status are one element for screen readers; the button beside it is its own. */}
                  <View
                    accessible
                    accessibilityLabel={t('schoolConsole.authorizations.spoken', { purpose: label, status: t(tag.key) })}
                    style={{ flexShrink: 1 }}
                  >
                    <View {...hidden} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
                      <Text style={[typography.body, { color: colors[authorizationListColors.text], flexShrink: 1 }]}>{label}</Text>
                      <Tag label={t(tag.key)} variant={tag.variant} icon={tag.icon} />
                    </View>
                  </View>
                  {status === 'pending' && athlete.canResend && (
                    <Button
                      variant="ghost"
                      label={t('schoolConsole.authorizations.resend')}
                      accessibilityHint={t('schoolConsole.authorizations.resend_hint', { guardian: athlete.guardian ?? noData, purpose: label, athlete: athlete.athlete })}
                      onPress={() => onResend(athlete.id, purpose)}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

export type SharingRequestListProps = {
  // null while the requests are not available (they are read online only): the title and a note, no requests.
  requests: SharingRequest[] | null;
  // Only report the press: the confirmation and the call belong to the caller.
  onApprove: (requestId: string) => void;
  onWithdraw: (requestId: string) => void;
};

// The schools that asked to see this school's results, each with the approve action.
export function SharingRequestList({ requests, onApprove, onWithdraw }: SharingRequestListProps) {
  const { colors, space, radius, typography } = useTheme();

  if (requests === null) {
    return (
      <View testID="sharing-requests" style={{ gap: space[2] }}>
        <Text accessibilityRole="header" style={[typography.label, { color: colors[authorizationListColors.text] }]}>
          {t('schoolConsole.authorizations.requests.title')}
        </Text>
        <Text style={[typography.caption, { color: colors[authorizationListColors.caption] }]}>{t('schoolConsole.authorizations.requests.offline')}</Text>
      </View>
    );
  }

  return (
    <View testID="sharing-requests" style={{ gap: space[2] }}>
      <Text accessibilityRole="header" style={[typography.label, { color: colors[authorizationListColors.text] }]}>
        {t('schoolConsole.authorizations.requests.title')}
      </Text>
      <View style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors[authorizationListColors.background] }}>
        {requests.map((request, index) => {
          const date = formatDate(request.requestedOn, 'short');
          return (
            <View
              key={request.id}
              style={[
                { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2], padding: space[3] },
                index < requests.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors[authorizationListColors.divider] },
              ]}
            >
              <View style={{ flexShrink: 1 }}>
                <Text style={[typography['body-strong'], { color: colors[authorizationListColors.text] }]}>{request.school}</Text>
                <Text style={[typography.caption, { color: colors[authorizationListColors.caption] }]}>
                  {/* A malformed date is left out rather than shown wrong. */}
                  {date
                    ? t('schoolConsole.authorizations.requests.detail_dated', { date })
                    : t('schoolConsole.authorizations.requests.detail')}
                </Text>
              </View>
              {request.status === 'pending' ? (
                <Button
                  variant="secondary"
                  label={t('schoolConsole.authorizations.requests.approve')}
                  accessibilityHint={t('schoolConsole.authorizations.requests.approve_hint', { school: request.school })}
                  onPress={() => onApprove(request.id)}
                />
              ) : (
                <Button
                  variant="secondary"
                  label={t('schoolConsole.authorizations.requests.withdraw')}
                  accessibilityHint={t('schoolConsole.authorizations.requests.withdraw_hint', { school: request.school })}
                  onPress={() => onWithdraw(request.id)}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
