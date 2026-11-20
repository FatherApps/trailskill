import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button } from '../../../core/ui';
import '../i18n';

export type PhotoCardState =
  /** show_photo is not in force: the only button opens the authorization first. */
  | 'unauthorized'
  | 'none'
  /** The photo is stored and shows for everyone allowed to see it. */
  | 'ready'
  /** Chosen on this phone and not sent yet (no signal, or the row is on its way): `status` says where it is. */
  | 'waiting';

export type PhotoCardNotice = 'camera_denied' | 'failed' | 'remove_offline' | 'remove_failed';

export type PhotoCardProps = {
  state: PhotoCardState;
  // The athlete's `lg` avatar, ready made by the container (the photo, or the initials), so this component never fetches.
  avatar: ReactNode;
  // The sync state of the photo (RecordSyncStatus, or the waiting pill); only while it is not synced.
  status?: ReactNode;
  // A photo is being saved or taken away: every button waits.
  busy?: boolean;
  notice?: PhotoCardNotice;
  onAuthorize: () => void;
  onTake: () => void;
  onChoose: () => void;
  // Left out when there is nothing to remove.
  onRemove?: () => void;
};

const noticeKey: Record<PhotoCardNotice, string> = {
  camera_denied: 'athletes.photo.notice_camera_denied',
  failed: 'athletes.photo.notice_failed',
  remove_offline: 'athletes.photo.notice_remove_offline',
  remove_failed: 'athletes.photo.notice_remove_failed',
};

const helpKey: Record<PhotoCardState, string> = {
  unauthorized: 'athletes.photo.help_unauthorized',
  none: 'athletes.photo.help_none',
  ready: 'athletes.photo.help_ready',
  waiting: 'athletes.photo.help_waiting',
};

// Presentational: whether the viewer may manage the photo (a guardian or the adult athlete, never a coach) is decided by the route, which passes the card or not.
export function PhotoCard({ state, avatar, status, busy = false, notice, onAuthorize, onTake, onChoose, onRemove }: PhotoCardProps) {
  const { colors, space, radius, typography } = useTheme();
  const has = state === 'ready' || state === 'waiting';
  const busyProps = busy ? { loading: true, loadingLabel: t('athletes.photo.saving') } : {};

  return (
    <View
      style={{
        alignSelf: 'stretch',
        gap: space[3],
        padding: space[4],
        borderRadius: radius.md,
        backgroundColor: colors['surface-1'],
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        {avatar}
        <View style={{ flex: 1, gap: space[1] }}>
          <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors.ink }]}>
            {t('athletes.photo.title')}
          </Text>
          <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t(helpKey[state])}</Text>
        </View>
      </View>
      {status}
      {notice && (
        <Banner variant="warn" icon="error">
          {t(noticeKey[notice])}
        </Banner>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
        {state === 'unauthorized' ? (
          <Button variant="secondary" label={t('athletes.photo.authorize')} onPress={onAuthorize} />
        ) : (
          <>
            <Button variant="secondary" label={t(has ? 'athletes.photo.take_other' : 'athletes.photo.take')} onPress={onTake} {...busyProps} />
            <Button variant="secondary" label={t(has ? 'athletes.photo.choose_other' : 'athletes.photo.choose')} onPress={onChoose} {...busyProps} />
            {onRemove && <Button variant="ghost" label={t('athletes.photo.remove')} onPress={onRemove} />}
          </>
        )}
      </View>
    </View>
  );
}
