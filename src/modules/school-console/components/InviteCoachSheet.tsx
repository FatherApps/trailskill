import { useRef, useState, type ReactNode } from 'react';
import { Share, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, Chip, TextField } from '../../../core/ui';
import '../i18n';
import { inviteShareText } from './inviteShare';
import { SideSheet } from './SideSheet';

export type InviteGroup = { id: string; name: string };

// The groups of the school, or why there are none to show yet: a group list that is missing is not an empty one.
export type InviteGroups = InviteGroup[] | 'loading' | 'error';

// What the sheet collects; sending it is the caller's job.
export type CoachInvitation = { name: string; email: string; groupIds: string[] };

export type InviteCoachSheetProps = {
  // The school that invites, named in the text that is shared.
  schoolName: string;
  // The groups of the school, one chip each. While they are 'loading' or failed ('error') the invitation cannot be sent.
  groups: InviteGroups;
  // The group the invitation link came from, chosen when the sheet opens; ignored when the school has no such group.
  initialGroupId?: string;
  // It may resolve `{ emailSent: false }` when the invitation was created but the email did not go out: the sheet then says so instead of the success text.
  // The sheet stays open until this finishes; if it throws or rejects, what was typed is kept and the error is shown.
  // When it resolves the sheet does not close: it shows the created invitation with the way to share it, and `onClose` closes it.
  // A caller that swallows its own error resolves, and the sheet takes that as sent: the promise must reject when the invitation fails.
  // The person can still close the sheet meanwhile; what this settles afterwards is the caller's to handle, the sheet is gone.
  onSubmit: (invitation: CoachInvitation) => void | Promise<void | { emailSent?: boolean }>;
  // Reads the groups again; offered next to the error when they failed to load.
  onRetryGroups?: () => void;
  // Something the caller needs the person to see while the sheet is open, shown above the form and above the created invitation (for example an earlier invitation that failed, or an email that did not go out).
  notice?: ReactNode;
  onClose: () => void;
};

// Not a validator of real addresses, only enough to catch a missing part; the caller's backend decides.
const EMAIL = /^\S+@\S+\.\S+$/;

// The invitation form in a side sheet. It keeps its own typing, so it is mounted anew each time it opens.
export function InviteCoachSheet({ schoolName, groups, initialGroupId, onSubmit, onRetryGroups, notice, onClose }: InviteCoachSheetProps) {
  const { colors, space, typography } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // Only what the user pressed; a group not in here follows the context group, so groups that arrive later are right too.
  // It is kept by id and never pruned: a group that leaves the list and comes back keeps its choice, and what is sent is filtered by the list.
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  // The ref is the guard (a second press can arrive before the next render); the state only draws the button busy.
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  // The translation key of what went wrong on the last try, or null.
  const [failure, setFailure] = useState<string | null>(null);
  // The email of the invitation once it was created; the sheet then shows how to share it instead of the form.
  const [created, setCreated] = useState<string | null>(null);
  // False when the invitation exists but its email did not go out.
  const [emailSent, setEmailSent] = useState(true);
  // Same as `sending`: the ref guards a second press, the state draws the button busy.
  const sharing = useRef(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);

  const available = Array.isArray(groups) ? groups : [];
  const isChosen = (id: string) => picked[id] ?? id === initialGroupId;
  const complete = name.trim() !== '' && EMAIL.test(email.trim());
  const disabledReason =
    groups === 'loading'
      ? t('schoolConsole.coaches.invite_sheet.groups_wait')
      : groups === 'error'
        ? t('schoolConsole.coaches.invite_sheet.groups_missing')
        : complete
          ? undefined
          : t('schoolConsole.coaches.invite_sheet.incomplete');
  // Nothing changes while an invitation is on its way; a change clears the error of the last try.
  const edit = (change: () => void) => {
    if (sending.current) return;
    setFailure(null);
    change();
  };
  const toggle = (id: string) => edit(() => setPicked((current) => ({ ...current, [id]: !isChosen(id) })));
  const send = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const result = await onSubmit({ name: name.trim(), email: email.trim(), groupIds: available.filter((group) => isChosen(group.id)).map((group) => group.id) });
      setEmailSent(result?.emailSent !== false);
      setCreated(email.trim());
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      // The server's send-limit codes each have their own text; any other rejection shows the generic one.
      setFailure(`schoolConsole.coaches.invite_sheet.${code === 'caller_rate_limited' || code === 'recipient_rate_limited' ? code : 'failed'}`);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const share = async () => {
    if (sharing.current || created === null) return;
    sharing.current = true;
    setShareBusy(true);
    setShareFailed(false);
    try {
      // Closing the system sheet without choosing resolves with `dismissedAction`: the person changed their mind, which is not an error.
      await Share.share({ message: inviteShareText(schoolName, created) });
    } catch {
      setShareFailed(true);
    } finally {
      sharing.current = false;
      setShareBusy(false);
    }
  };

  if (created !== null) {
    return (
      <SideSheet label={t('schoolConsole.coaches.invite_sheet.label')} titleKey="schoolConsole.coaches.invite" onClose={onClose}>
        {notice}
        {emailSent ? (
          <Banner variant="success" icon="check_circle">
            {t('schoolConsole.coaches.invite_sheet.created', { email: created })}
          </Banner>
        ) : (
          <Banner variant="warn" icon="error">
            {t('schoolConsole.coaches.invite_sheet.email_not_sent')}
          </Banner>
        )}
        {shareFailed && (
          <Banner variant="warn" icon="error">
            {t('schoolConsole.coaches.invite_sheet.share_failed')}
          </Banner>
        )}
        <Button variant="secondary" label={t('schoolConsole.coaches.invite_sheet.share_invitation')} loading={shareBusy} onPress={() => void share()} />
        <Button label={t('schoolConsole.coaches.invite_sheet.done')} onPress={onClose} />
      </SideSheet>
    );
  }

  return (
    <SideSheet label={t('schoolConsole.coaches.invite_sheet.label')} titleKey="schoolConsole.coaches.invite" onClose={onClose}>
      {notice}
      <TextField label={t('schoolConsole.coaches.invite_sheet.name')} value={name} onChangeText={(text) => edit(() => setName(text))} readOnly={busy} autoComplete="name" />
      <TextField
        label={t('schoolConsole.coaches.invite_sheet.email')}
        value={email}
        onChangeText={(text) => edit(() => setEmail(text))}
        readOnly={busy}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
      />
      {groups === 'error' && (
        <Banner variant="warn" icon="error">
          {t('schoolConsole.coaches.invite_sheet.groups_failed')}
        </Banner>
      )}
      {groups === 'error' && onRetryGroups && <Button variant="secondary" label={t('schoolConsole.screen.retry')} loading={busy} onPress={onRetryGroups} />}
      {groups === 'loading' && <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('schoolConsole.coaches.invite_sheet.groups_loading')}</Text>}
      {available.length > 0 && (
        <View style={{ gap: space[2] }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t('schoolConsole.coaches.invite_sheet.groups')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {available.map((group) => (
              <Chip key={group.id} label={group.name} selected={isChosen(group.id)} disabled={busy} onPress={() => toggle(group.id)} />
            ))}
          </View>
        </View>
      )}
      {failure && (
        <Banner variant="warn" icon="error">
          {t(failure)}
        </Banner>
      )}
      <Button
        label={t('schoolConsole.coaches.invite_sheet.send')}
        loading={busy}
        disabledReason={busy ? undefined : disabledReason}
        onPress={() => void send()}
      />
    </SideSheet>
  );
}
