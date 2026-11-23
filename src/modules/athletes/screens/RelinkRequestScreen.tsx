import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, ColorHeader, StateView, Tag, TextField, type TagVariant } from '../../../core/ui';
import '../i18n';
import { athleteColor } from '../athleteDisplay';
import { formatDate } from '../components/formatDate';
import type { RelinkRequest, RelinkRequestResult } from '../data/athleteRelink';

/** What the last attempt answered; `sending` while it runs and `error` when it could not reach the server. */
export type RelinkRequestState = 'idle' | 'sending' | 'error' | RelinkRequestResult;

/** The requests the family already made: read online, so they may still be loading, failed or offline. */
export type RelinkRequestsView = { kind: 'loading' } | { kind: 'error'; onRetry: () => void } | { kind: 'ready'; requests: RelinkRequest[] };

export type RelinkRequestScreenProps = {
  athleteId: string;
  athleteName: string;
  /** What the person typed. The screen never keeps it: the container clears it once it is sent. */
  keyValue: string;
  onChangeKey: (value: string) => void;
  state: RelinkRequestState;
  requests: RelinkRequestsView;
  onSubmit: () => void;
  onBack: () => void;
};

const STATE_BANNER: Partial<Record<RelinkRequestState, { variant: 'info' | 'warn' | 'success'; icon: 'check_circle' | 'error' | 'info' }>> = {
  requested: { variant: 'success', icon: 'check_circle' },
  already_requested: { variant: 'info', icon: 'info' },
  nothing_to_relink: { variant: 'info', icon: 'info' },
  invalid_key: { variant: 'warn', icon: 'error' },
  rate_limited: { variant: 'warn', icon: 'error' },
  error: { variant: 'warn', icon: 'error' },
};

const STATUS_TAG: Record<RelinkRequest['status'], TagVariant> = { pending: 'warn', approved: 'ok', rejected: 'neutral' };

function requestDetail(request: RelinkRequest, athleteName: string): string {
  if (request.status === 'approved') return t('athletes.relink.requests.approved_detail', { count: request.movedCount ?? 0, name: athleteName });
  if (request.status === 'rejected') return t('athletes.relink.requests.rejected_detail');
  return t('athletes.relink.requests.pending_detail');
}

// Presentational: no network, database or repository. The family types the key of the swimmer who was erased, or a recovery code they saved
// (always by hand: nothing stored on the phone is offered, issue 1421), and sees what the school answered.
export function RelinkRequestScreen({ athleteId, athleteName, keyValue, onChangeKey, state, requests, onSubmit, onBack }: RelinkRequestScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  const banner = STATE_BANNER[state];
  const sending = state === 'sending';

  return (
    <View style={{ alignSelf: 'stretch', flex: 1, backgroundColor: colors['surface-0'] }}>
      <ColorHeader color={athleteColor(athleteId)} title={t('athletes.relink.title')} onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[12] * 2 }} keyboardShouldPersistTaps="handled">
        <Text style={[typography.body, { color: colors.ink }]}>{t('athletes.relink.intro', { name: athleteName })}</Text>
        <TextField
          label={t('athletes.relink.key_label')}
          help={t('athletes.relink.key_help')}
          value={keyValue}
          onChangeText={onChangeKey}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          // The key is a secret: it is never offered to the keyboard history.
          importantForAutofill="no"
          returnKeyType="send"
          onSubmitEditing={onSubmit}
        />
        {banner ? (
          <Banner variant={banner.variant} icon={banner.icon}>
            {t(`athletes.relink.result.${state}`)}
          </Banner>
        ) : null}
        <Button
          variant="primary"
          label={t('athletes.relink.submit')}
          onPress={onSubmit}
          loading={sending}
          loadingLabel={t('athletes.relink.sending')}
          disabledReason={keyValue.trim().length === 0 ? t('athletes.relink.key_required') : undefined}
        />

        <View testID="relink-requests" style={{ gap: space[2] }}>
          <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors.ink }]}>
            {t('athletes.relink.requests.title')}
          </Text>
          {requests.kind === 'loading' ? <StateView kind="loading" /> : null}
          {requests.kind === 'error' ? (
            <View style={{ gap: space[2], alignItems: 'flex-start' }}>
              <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('athletes.relink.requests.error_message')}</Text>
              <Button variant="ghost" label={t('athletes.relink.requests.retry')} onPress={requests.onRetry} />
            </View>
          ) : null}
          {requests.kind === 'ready' && requests.requests.length === 0 ? (
            <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('athletes.relink.requests.empty')}</Text>
          ) : null}
          {requests.kind === 'ready' && requests.requests.length > 0 ? (
            <View style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors['surface-1'] }}>
              {requests.requests.map((request, index) => {
                const date = formatDate(request.createdAt.slice(0, 10), 'short');
                return (
                  <View
                    key={request.id}
                    style={[
                      { gap: space[1], padding: space[3] },
                      index < requests.requests.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                      <Text style={[typography['body-strong'], { color: colors.ink, flexShrink: 1 }]}>{request.schoolName}</Text>
                      <Tag label={t(`athletes.relink.requests.status.${request.status}`)} variant={STATUS_TAG[request.status]} />
                    </View>
                    <Text style={[typography.caption, { color: colors['ink-muted'] }]}>
                      {/* A malformed date is left out rather than shown wrong. */}
                      {date ? `${t('athletes.relink.requests.asked_on', { date })} · ` : ''}
                      {requestDetail(request, athleteName)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
