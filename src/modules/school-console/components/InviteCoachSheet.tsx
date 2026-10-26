import { useState } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, Chip, TextField } from '../../../core/ui';
import '../i18n';
import { SideSheet } from './SideSheet';

export type InviteGroup = { id: string; name: string };

// What the sheet collects; sending it is the caller's job.
export type CoachInvitation = { name: string; email: string; groupIds: string[] };

export type InviteCoachSheetProps = {
  // The groups of the school, one chip each.
  groups: InviteGroup[];
  // The group the invitation link came from, chosen when the sheet opens; ignored when the school has no such group.
  initialGroupId?: string;
  // The sheet stays open until this finishes; if it throws or rejects, what was typed is kept and the error is shown.
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
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const isChosen = (id: string) => picked[id] ?? id === initialGroupId;
  const complete = name.trim() !== '' && EMAIL.test(email.trim());
  const toggle = (id: string) => setPicked((current) => ({ ...current, [id]: !isChosen(id) }));
  const send = async () => {
    if (sending) return;
    setSending(true);
    setFailed(false);
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), groupIds: groups.filter((group) => isChosen(group.id)).map((group) => group.id) });
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <SideSheet label={t('schoolConsole.coaches.invite_sheet.label')} titleKey="schoolConsole.coaches.invite" onClose={onClose}>
      <TextField label={t('schoolConsole.coaches.invite_sheet.name')} value={name} onChangeText={setName} autoComplete="name" />
      <TextField
        label={t('schoolConsole.coaches.invite_sheet.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
      />
      {groups.length > 0 && (
        <View style={{ gap: space[2] }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t('schoolConsole.coaches.invite_sheet.groups')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {groups.map((group) => (
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
        disabledReason={complete ? undefined : t('schoolConsole.coaches.invite_sheet.incomplete')}
        onPress={() => void send()}
      />
    </SideSheet>
  );
}
