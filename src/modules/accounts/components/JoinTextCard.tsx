import { Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import type { AuthorizationText } from '../data/authorizations';
import { t } from '../i18n';
import { consentCardColors } from './ConsentCard';

// One authorization of joining a school with its full text and version, with no box: joining accepts the three together.
export function JoinTextCard({ text }: { text: AuthorizationText }) {
  const { colors, radius, space, typography } = useTheme();
  return (
    <View style={{ gap: space[1], padding: space[4], borderRadius: radius.md, backgroundColor: colors[consentCardColors.background] }}>
      <Text style={[typography.subtitle, { color: colors[consentCardColors.title] }]}>{t(`accounts.consent.purpose.${text.purpose}`)}</Text>
      <Text style={[typography.body, { color: colors[consentCardColors.text] }]}>{text.body}</Text>
      <Text style={[typography.caption, { color: colors[consentCardColors.text] }]}>{t('accounts.consent.version', { version: text.version })}</Text>
    </View>
  );
}
