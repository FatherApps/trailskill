import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RecordSyncStatus, useRecordSyncState } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import { Button, Icon, Tag } from '../../../core/ui';
import type { AuthorizationPurpose } from '../data/authorizationStatus';
import type { AuthorizationRecord, AuthorizationText } from '../data/authorizations';
import { t } from '../i18n';

export type ConsentCardProps = {
  athleteName: string;
  // The athlete's AthleteAvatar, ready made: the card never fetches the photo.
  avatar: ReactNode;
  // The current text of each purpose, in screen order: one checkbox line per text.
  texts: AuthorizationText[];
  // The authorizations in force of this athlete, by purpose: their box shows checked and unchecking it asks to withdraw.
  inForce: Partial<Record<AuthorizationPurpose, AuthorizationRecord>>;
  // What the person checked in this session and has not saved. Nothing is ever pre-checked: the caller starts it empty.
  selected: Partial<Record<AuthorizationPurpose, boolean>>;
  onToggle: (purpose: AuthorizationPurpose) => void;
  onWithdraw: (authorizationId: string) => void;
};

// The colors the card uses, so the contrast test reads the same tokens.
export const consentCardColors = { background: 'surface-1', title: 'ink', text: 'ink-muted' } as const;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  check: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  title: { flex: 1 },
  box: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
});

// Synced timestamps use a space and microseconds, which not every JS engine parses.
function dateOf(timestamp: string): string {
  return new Date(timestamp.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1')).toLocaleDateString('es-CO');
}

// The pill only while the record has not reached the server: "Enviado" is the normal state and is not shown.
function PendingSync({ id }: { id: string }) {
  return useRecordSyncState('authorizations', id) === 'synced' ? null : <RecordSyncStatus table="authorizations" id={id} />;
}

// One purpose: a checkbox with its short name, and the sync pill of its authorization while that is not sent.
function PurposeLine({ purpose, accepted, checked, onPress }: { purpose: AuthorizationPurpose; accepted?: AuthorizationRecord; checked: boolean; onPress: () => void }) {
  const { colors, space, size, typography } = useTheme();
  const title = t(`accounts.consent.purpose.${purpose}`);
  return (
    <View style={[styles.line, { gap: space[2] }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={title}
        accessibilityState={{ checked }}
        onPress={onPress}
        style={[styles.check, { gap: space[3], minHeight: size['target-min'] }]}
      >
        <View
          style={[
            styles.box,
            {
              width: size['icon-md'],
              height: size['icon-md'],
              borderRadius: space[1],
              borderColor: colors[checked ? 'primary' : 'border-strong'],
              backgroundColor: checked ? colors.primary : undefined,
            },
          ]}
        >
          {checked && <Icon name="check" size="icon-sm" color="on-primary" />}
        </View>
        <Text style={[typography.body, styles.title, { color: colors[consentCardColors.title] }]}>{title}</Text>
      </Pressable>
      {accepted && <PendingSync id={accepted.id} />}
    </View>
  );
}

// One athlete: their name, one checkbox per purpose, and the full legal text folded until the person asks to read it.
export function ConsentCard({ athleteName, avatar, texts, inForce, selected, onToggle, onWithdraw }: ConsentCardProps) {
  const { colors, space, radius, typography } = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{ gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors[consentCardColors.background] }}>
      <View style={[styles.header, { gap: space[2] }]}>
        {avatar}
        <Text accessibilityRole="header" style={[typography.subtitle, styles.title, { color: colors[consentCardColors.title] }]}>
          {athleteName}
        </Text>
      </View>
      {!inForce.record_times && <Tag variant="warn" label={t('accounts.authorizations.skipped')} />}
      {texts.map(({ purpose }) => {
        const accepted = inForce[purpose];
        return (
          <PurposeLine
            key={purpose}
            purpose={purpose}
            accepted={accepted}
            checked={Boolean(accepted) || selected[purpose] === true}
            onPress={() => (accepted ? onWithdraw(accepted.id) : onToggle(purpose))}
          />
        );
      })}
      <Button variant="ghost" label={t('accounts.consent.read_full')} onPress={() => setExpanded((open) => !open)} />
      {expanded &&
        texts.map((text) => {
          const accepted = inForce[text.purpose];
          const version = accepted ? accepted.textVersion : text.version;
          return (
            <View key={text.purpose} style={{ gap: space[1] }}>
              <Text style={[typography.subtitle, { color: colors[consentCardColors.title] }]}>{t(`accounts.consent.purpose.${text.purpose}`)}</Text>
              <Text style={[typography.body, { color: colors[consentCardColors.text] }]}>
                {accepted ? (accepted.textBody ?? t('accounts.consent.text_loading')) : text.body}
              </Text>
              {version !== null && (
                <Text style={[typography.caption, { color: colors[consentCardColors.text] }]}>{t('accounts.consent.version', { version })}</Text>
              )}
              {accepted && (
                <Text style={[typography.body, { color: colors[consentCardColors.title] }]}>
                  {t('accounts.consent.accepted', { date: dateOf(accepted.acceptedAt) })}
                </Text>
              )}
            </View>
          );
        })}
    </View>
  );
}
