import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, Tag, type TagVariant } from '../../../core/ui';
import type { SchoolRelinkRequest } from '../../athletes';
import '../i18n';
import { authorizationListColors } from './AuthorizationList';
import { formatDate } from './formatDate';

// What the area has to show: the requests, or why there are none to show. An empty list is a real answer ("nobody asked"); the others are not.
export type RelinkRequestsState = SchoolRelinkRequest[] | 'loading' | 'offline' | 'error';

export type RelinkRequestListProps = {
  // Read online only. Offline or failed: the title and a note (with a retry when the read failed), no requests. The caller shows nothing while loading.
  requests: Exclude<RelinkRequestsState, 'loading'>;
  // Only report the press: the confirmation and the call belong to the caller.
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onRetry: () => void;
};

const STATUS_TAG: Record<SchoolRelinkRequest['status'], TagVariant> = { pending: 'warn', approved: 'ok', rejected: 'neutral' };

export const relinkAthleteName = (request: SchoolRelinkRequest) => `${request.athleteFirstName} ${request.athleteLastName}`.trim();

function detail(request: SchoolRelinkRequest): string {
  if (request.status === 'approved') return t('schoolConsole.authorizations.relink.approved_detail', { count: request.movedCount ?? 0 });
  if (request.status === 'rejected') return t('schoolConsole.authorizations.relink.rejected_detail');
  return t('schoolConsole.authorizations.relink.pending_detail', { count: request.timesCount });
}

// The families that ask this school for the times it kept of an erased swimmer: approve or reject a pending one. Only an active admin gets rows.
export function RelinkRequestList({ requests, onApprove, onReject, onRetry }: RelinkRequestListProps) {
  const { colors, space, radius, typography } = useTheme();
  const title = (
    <Text accessibilityRole="header" style={[typography.label, { color: colors[authorizationListColors.text] }]}>
      {t('schoolConsole.authorizations.relink.title')}
    </Text>
  );

  if (!Array.isArray(requests)) {
    return (
      <View testID="relink-requests" style={{ gap: space[2], alignItems: 'flex-start' }}>
        {title}
        <Text style={[typography.caption, { color: colors[authorizationListColors.caption] }]}>{t(`schoolConsole.authorizations.relink.${requests}`)}</Text>
        {requests === 'error' && <Button variant="ghost" label={t('schoolConsole.screen.retry')} onPress={onRetry} />}
      </View>
    );
  }

  return (
    <View testID="relink-requests" style={{ gap: space[2] }}>
      {title}
      <View style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors[authorizationListColors.background] }}>
        {requests.map((request, index) => {
          const date = formatDate(request.createdAt.slice(0, 10), 'short');
          const name = relinkAthleteName(request);
          return (
            <View
              key={request.id}
              style={[
                { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2], padding: space[3] },
                index < requests.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors[authorizationListColors.divider] },
              ]}
            >
              <View style={{ flexShrink: 1, gap: space[1] }}>
                <Text style={[typography['body-strong'], { color: colors[authorizationListColors.text] }]}>{name}</Text>
                <Text style={[typography.caption, { color: colors[authorizationListColors.caption] }]}>
                  {/* A malformed date is left out rather than shown wrong. */}
                  {date ? `${detail(request)} · ${date}` : detail(request)}
                </Text>
              </View>
              {request.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: space[2] }}>
                  <Button
                    variant="ghost"
                    label={t('schoolConsole.authorizations.relink.reject')}
                    accessibilityHint={t('schoolConsole.authorizations.relink.reject_hint', { athlete: name })}
                    onPress={() => onReject(request.id)}
                  />
                  <Button
                    variant="secondary"
                    label={t('schoolConsole.authorizations.relink.approve')}
                    accessibilityHint={t('schoolConsole.authorizations.relink.approve_hint', { athlete: name })}
                    onPress={() => onApprove(request.id)}
                  />
                </View>
              ) : (
                <Tag label={t(`schoolConsole.authorizations.relink.status.${request.status}`)} variant={STATUS_TAG[request.status]} />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
