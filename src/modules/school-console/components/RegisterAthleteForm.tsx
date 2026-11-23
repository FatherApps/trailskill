import { useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, Icon, TextField } from '../../../core/ui';
import '../i18n';
import { formatDate, localDate } from './formatDate';

// What registering answers: the claim link to hand to the family and the day it stops working (ISO 8601).
export type RegisteredSwimmer = { link: string; expiresAt: string };

export type RegisterAthleteFormProps = {
  // The school that registers, named in the text that is shared.
  schoolName: string;
  // Registering is online only (the server makes the claim token): while true the button says so and sends nothing.
  offline?: boolean;
  // Rejects with an Error whose message is the repository's code ('not_allowed', 'invalid'); anything else shows the generic text.
  // The same call is repeated after a failure, so the caller keeps one swimmer id per opening of the sheet.
  onSubmit: (swimmer: { firstName: string; lastName: string }) => Promise<RegisteredSwimmer>;
  // Opens the system share sheet; replaced in tests.
  share?: (message: string) => Promise<unknown>;
  onClose: () => void;
};

const KNOWN_ERRORS = ['not_allowed', 'invalid'];

const styles = StyleSheet.create({
  check: { flexDirection: 'row', alignItems: 'center' },
  box: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
});

const defaultShare = (message: string) => Share.share({ message });

// The content of the side sheet that registers a swimmer who has no account: the names and the school's declaration that it holds the
// guardian's signed authorization, then the claim link to share. The host puts it in the console's sheet and mounts it anew each time it opens.
export function RegisterAthleteForm({ schoolName, offline = false, onSubmit, share = defaultShare, onClose }: RegisterAthleteFormProps) {
  const { colors, space, size, typography } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // Never pre-checked: the school attests on purpose, every time.
  const [declared, setDeclared] = useState(false);
  // The refs guard a second press that arrives before the next render; the state only draws the buttons busy.
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; swimmer: RegisteredSwimmer }>();
  const sharing = useRef(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);

  const complete = firstName.trim() !== '' && lastName.trim() !== '';
  const disabledReason = offline
    ? t('schoolConsole.register_sheet.offline')
    : !complete
      ? t('schoolConsole.register_sheet.incomplete')
      : !declared
        ? t('schoolConsole.register_sheet.declaration_missing')
        : undefined;
  // Nothing changes while the call is on its way; a change clears the error of the last try.
  const edit = (change: () => void) => {
    if (sending.current) return;
    setFailure(null);
    change();
  };

  const send = async () => {
    if (sending.current || disabledReason !== undefined) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const names = { firstName: firstName.trim(), lastName: lastName.trim() };
      const swimmer = await onSubmit(names);
      setCreated({ name: `${names.firstName} ${names.lastName}`, swimmer });
    } catch (error) {
      const code = error instanceof Error && KNOWN_ERRORS.includes(error.message) ? error.message : 'other';
      setFailure(t(`schoolConsole.register_sheet.error.${code}`));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const shareLink = async () => {
    if (sharing.current || !created) return;
    sharing.current = true;
    setShareBusy(true);
    setShareFailed(false);
    try {
      // A date that cannot be read drops the expiry sentence instead of leaving it blank.
      const date = formatDate(localDate(new Date(created.swimmer.expiresAt)), 'long');
      await share(
        t(date === null ? 'schoolConsole.register_sheet.share_text_no_date' : 'schoolConsole.register_sheet.share_text', {
          school: schoolName,
          name: created.name,
          link: created.swimmer.link,
          date: date ?? '',
        }),
      );
    } catch {
      // Closing the system sheet without choosing resolves: the person changed their mind, which is not an error.
      setShareFailed(true);
    } finally {
      sharing.current = false;
      setShareBusy(false);
    }
  };

  if (created) {
    return (
      <>
        <Banner variant="success" icon="check_circle">
          {t('schoolConsole.register_sheet.created', { name: created.name })}
        </Banner>
        <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('schoolConsole.register_sheet.link_help')}</Text>
        <Text selectable style={[typography.body, { color: colors.ink }]}>
          {created.swimmer.link}
        </Text>
        {shareFailed && (
          <Banner variant="warn" icon="error">
            {t('schoolConsole.register_sheet.share_failed')}
          </Banner>
        )}
        <Button variant="secondary" label={t('schoolConsole.register_sheet.share')} loading={shareBusy} onPress={() => void shareLink()} />
        <Button label={t('schoolConsole.register_sheet.done')} onPress={onClose} />
      </>
    );
  }

  return (
    <>
      <TextField label={t('schoolConsole.register_sheet.first_name')} value={firstName} onChangeText={(text) => edit(() => setFirstName(text))} readOnly={busy} autoComplete="name-given" />
      <TextField label={t('schoolConsole.register_sheet.last_name')} value={lastName} onChangeText={(text) => edit(() => setLastName(text))} readOnly={busy} autoComplete="name-family" />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={t('schoolConsole.register_sheet.declaration')}
        accessibilityState={{ checked: declared }}
        onPress={() => edit(() => setDeclared((value) => !value))}
        style={[styles.check, { gap: space[3], minHeight: size['target-min'] }]}
      >
        <View
          style={[
            styles.box,
            {
              width: size['icon-md'],
              height: size['icon-md'],
              borderRadius: space[1],
              borderColor: colors[declared ? 'primary' : 'border-strong'],
              backgroundColor: declared ? colors.primary : undefined,
            },
          ]}
        >
          {declared && <Icon name="check" size="icon-sm" color="on-primary" />}
        </View>
        <Text style={[typography.body, { flex: 1, color: colors.ink }]}>{t('schoolConsole.register_sheet.declaration')}</Text>
      </Pressable>
      {failure && (
        <Banner variant="warn" icon="error">
          {failure}
        </Banner>
      )}
      <Button label={t('schoolConsole.register_sheet.submit')} loading={busy} disabledReason={busy ? undefined : disabledReason} onPress={() => void send()} />
    </>
  );
}
