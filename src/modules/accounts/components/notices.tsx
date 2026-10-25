import { Text } from 'react-native';

import { typography } from '../../../core/theme';
import { Banner } from '../../../core/ui';
import { t } from '../i18n';

export type Invitation = { school: string; group: string };

export function InvitationBanner({ school, group }: Invitation) {
  return (
    <Banner variant="info" icon="school">
      {t('accounts.invitation.before')}
      <Text style={typography['body-strong']}>{school}</Text>
      {t('accounts.invitation.middle')}
      <Text style={typography['body-strong']}>{group}</Text>
      {t('accounts.invitation.after')}
    </Banner>
  );
}

// The draft is kept: only what needs the network waits for signal.
export function OfflineBanner() {
  return (
    <Banner variant="warn" icon="wifi_off">
      {t('accounts.offline.notice')}
    </Banner>
  );
}
