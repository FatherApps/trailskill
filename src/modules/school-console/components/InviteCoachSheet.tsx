import { useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, Chip, TextField } from '../../../core/ui';
import '../i18n';
import { SideSheet } from './SideSheet';

export type InviteGroup = { id: string; name: string };

// The groups of the school, or why there are none to show yet: a group list that is missing is not an empty one.
export type InviteGroups = InviteGroup[] | 'loading' | 'error';

// What the sheet collects; sending it is the caller's job.
export type CoachInvitation = { name: string; email: string; groupIds: string[] };

export type InviteCoachSheetProps = {
  // The groups of the school, one chip each. While they are 'loading' or failed ('error') the invitation cannot be sent.
  groups: InviteGroups;
  // The group the invitation link came from, chosen when the sheet opens; ignored when the school has no such group.
  initialGroupId?: string;
  // The sheet stays open until this finishes; if it throws or rejects, what was typed is kept and the error is shown.
  // A caller that swallows its own error resolves, and the sheet takes that as sent: the promise must reject when the invitation fails.
  // The person can still close the sheet meanwhile; what this settles afterwards is the caller's to handle, the sheet is gone.
  onSubmit: (invitation: CoachInvitation) => void | Promise<void>;
  // Reads the groups again; offered next to the error when they failed to load.
  onRetryGroups?: () => void;
  // Something the caller needs the person to see while the sheet is open, shown above the form (for example an earlier invitation that failed).
  notice?: ReactNode;
  onClose: () => void;
};

// Not a validator of real addresses, only enough to catch a missing part; the caller's backend decides.
const EMAIL = /^\S+@\S+\.\S+$/;

// The invitation form in a side sheet. It keeps its own typing, so it is mounted anew each time it opens.
export function InviteCoachSheet({ groups, initialGroupId, onSubmit, onRetryGroups, notice, onClose }: InviteCoachSheetProps) {
  const { colors, space, typography } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // Only what the user pressed; a group not in here follows the context group, so groups that arrive later are right too.
  // It is kept by id and never pruned: a group that leaves the list and comes back keeps its choice, and what is sent is filtered by the list.
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  // The ref is the guard (a second press can arrive before the next render); the state only draws the button busy.
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

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
    setFailed(false);
    change();
  };
  const toggle = (id: string) => edit(() => setPicked((current) => ({ ...current, [id]: !isChosen(id) })));
  const send = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), groupIds: available.filter((group) => isChosen(group.id)).map((group) => group.id) });
    } catch {
      setFailed(true);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

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
      {failed && (
        <Banner variant="warn" icon="error">
          {t('schoolConsole.coaches.invite_sheet.failed')}
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
