import { Text } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Banner, Button } from '../../../core/ui';
import { formatDeletionDate } from '../components/deletionDate';
import { OfflineNotice } from '../components/OfflineNotice';
import { ScreenFrame } from '../components/ScreenFrame';
import { t } from '../i18n';

export type DeletionGraceScreenProps = {
  // When the account will be deleted (an ISO timestamp).
  deleteAfter: string;
  // No signal: cancelling needs the server, so the screen says so and does not call it.
  online: boolean;
  cancelling?: boolean;
  failed?: boolean;
  onCancel: () => void;
};

// What a person with an account marked for deletion sees on coming back: the date and the way to cancel, nothing else (approved by the maintainer).
export function DeletionGraceScreen({ deleteAfter, online, cancelling, failed, onCancel }: DeletionGraceScreenProps) {
  const { colors, typography } = useTheme();
  return (
    <ScreenFrame
      title={t('accounts.grace.title')}
      footer={
        <Button
          label={t('accounts.grace.cancel')}
          loading={cancelling}
          loadingLabel={t('accounts.grace.cancelling')}
          disabledReason={online ? undefined : t('accounts.offline.reason')}
          onPress={onCancel}
        />
      }
    >
      <Text accessibilityRole="header" style={[typography.subtitle, { color: colors.ink }]}>
        {t('accounts.grace.date', { date: formatDeletionDate(deleteAfter) })}
      </Text>
      {failed ? <Banner variant="warn">{t('accounts.grace.cancel_failed')}</Banner> : null}
      {!online ? <OfflineNotice>{t('accounts.grace.offline')}</OfflineNotice> : null}
    </ScreenFrame>
  );
}
