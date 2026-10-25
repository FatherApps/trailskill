import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RecordSyncStatus } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import { Button, Icon } from '../../../core/ui';
import type { AuthorizationRecord, AuthorizationText } from '../data/authorizations';
import { t } from '../i18n';

export type ConsentCardProps = {
  text: AuthorizationText;
  // The authorization in force for this purpose: shows the acceptance instead of the checkbox.
  accepted?: AuthorizationRecord;
  // The checkbox always starts unchecked: the caller never pre-checks it.
  checked: boolean;
  onToggle: () => void;
  onWithdraw: (authorizationId: string) => void;
};

// The colors the card uses, so the contrast test reads the same tokens.
export const consentCardColors = { background: 'surface-1', title: 'ink', text: 'ink-muted' } as const;

const styles = StyleSheet.create({
  check: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
});

// Synced timestamps use a space and microseconds, which not every JS engine parses.
function dateOf(timestamp: string): string {
  return new Date(timestamp.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1')).toLocaleDateString('es-CO');
}

// One purpose: the exact text shown, its version, and either an unchecked box or the acceptance with its way out.
export function ConsentCard({ text, accepted, checked, onToggle, onWithdraw }: ConsentCardProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const title = t(`accounts.consent.purpose.${text.purpose}`);
  const titleStyle = [typography.subtitle, styles.title, { color: colors[consentCardColors.title] }];

  return (
    <View
      style={{ gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors[consentCardColors.background] }}
    >
      {accepted ? (
        <Text accessibilityRole="header" style={titleStyle}>
          {title}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={title}
          accessibilityState={{ checked }}
          onPress={onToggle}
          style={[styles.check, { gap: space[3], minHeight: size['target-min'] }]}
        >
          <Icon name={checked ? 'check_circle' : 'radio_button_unchecked'} />
          <Text style={titleStyle}>{title}</Text>
        </Pressable>
      )}
      <Text style={[typography.body, { color: colors[consentCardColors.text] }]}>{accepted ? accepted.textBody : text.body}</Text>
      <Text style={[typography.caption, { color: colors[consentCardColors.text] }]}>
        {t('accounts.consent.version', { version: accepted ? accepted.textVersion : text.version })}
      </Text>
      {accepted && (
        <>
          <Text style={[typography.body, { color: colors[consentCardColors.title] }]}>
            {t('accounts.consent.accepted', { date: dateOf(accepted.acceptedAt) })}
          </Text>
          <RecordSyncStatus table="authorizations" id={accepted.id} />
          <Button variant="secondary" label={t('accounts.consent.withdraw')} onPress={() => onWithdraw(accepted.id)} />
        </>
      )}
    </View>
  );
}
