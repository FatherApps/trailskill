import { useRef, useState } from 'react';
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
  onSubmit: (invitation: CoachInvitation) => void | Promise<void>;
  onClose: () => void;
};

// Not a validator of real addresses, only enough to catch a missing part; the caller's backend decides.
const EMAIL = /^\S+@\S+\.\S+$/;

// The invitation form in a side sheet. It keeps its own typing, so it is mounted anew each time it opens.
export function InviteCoachSheet({ groups, initialGroupId, onSubmit, onClose }: InviteCoachSheetProps) {
  const { colors, space, typography } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // Only what the user pressed; a group not in here follows the context group, so groups that arrive later are right too.
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  // The ref is the guard (a second press can arrive before the next render); the state only draws the button busy.
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const available = Array.isArray(groups) ? groups : [];
  // A group that left the list is forgotten, so it does not come back chosen; while the list is 'loading' or failed nothing is known, so nothing is dropped.
  // Adjusting during render (not in an effect) keeps the pruned state from ever being drawn.
  const [seen, setSeen] = useState(groups);
  if (groups !== seen) {
    setSeen(groups);
    if (Array.isArray(groups)) {
      const kept = Object.entries(picked).filter(([id]) => groups.some((group) => group.id === id));
      if (kept.length !== Object.keys(picked).length) setPicked(Object.fromEntries(kept));
    }
  }
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
    } catch (error) {
      console.warn('[school-console] The coach invitation could not be sent', error);
      setFailed(true);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <SideSheet label={t('schoolConsole.coaches.invite_sheet.label')} titleKey="schoolConsole.coaches.invite" onClose={() => !sending.current && onClose()}>
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
      {groups === 'loading' && <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('schoolConsole.coaches.invite_sheet.groups_loading')}</Text>}
      {available.length > 0 && (
        <View style={{ gap: space[2] }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t('schoolConsole.coaches.invite_sheet.groups')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {available.map((group) => (
              <Chip key={group.id} label={group.name} selected={isChosen(group.id)} onPress={() => toggle(group.id)} />
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
