import { useState, type ReactElement, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { t } from '../i18n';
import type { RecordSyncState } from '../sync';
import { space, useTheme } from '../theme';
import { buttonFixture as b } from './__fixtures__/button';
import { confirmSheetFixture as cs } from './__fixtures__/confirmSheet';
import { stateViewFixture as sv } from './__fixtures__/stateView';
import { stepHeaderFixture as sh } from './__fixtures__/stepHeader';
import { tagFixture as tg } from './__fixtures__/tag';
import { textFieldFixture as tf } from './__fixtures__/textField';
import { Button } from './Button';
import { ConfirmSheet } from './ConfirmSheet';
import { Icon } from './Icon';
import { iconPaths, type IconName } from './icons';
import { StateView } from './StateView';
import { StepHeader } from './StepHeader';
import { SyncStatus } from './SyncStatus';
import { Tag } from './Tag';
import { TextField } from './TextField';

// One component or screen in the development gallery: each state renders it with synthetic props.
export type GalleryEntry = {
  id: string;
  title: string;
  states: Record<string, () => ReactElement>;
};

const noop = () => {};

// The preview box shrinks its children to their content; these components need the full width.
const FullWidth = ({ children }: { children: ReactNode }) => <View style={{ alignSelf: 'stretch' }}>{children}</View>;

const iconNames = Object.keys(iconPaths) as IconName[];

// Every icon of the set at one size, each with its name below.
function IconSet({ size }: { size: 'icon-md' | 'icon-sm' }) {
  const { colors, space: gap, typography } = useTheme();

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gap[4] }}>
      {iconNames.map((name) => (
        <View key={name} style={{ alignItems: 'center', gap: gap[1] }}>
          <Icon name={name} size={size} />
          <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

// The sheet is a modal that covers the gallery, so each state opens it on demand.
function ConfirmSheetPreview({ copy, destructive }: { copy: typeof cs.stop; destructive: boolean }) {
  const [visible, setVisible] = useState(false);
  const close = () => setVisible(false);

  return (
    <>
      <Button variant="secondary" label={cs.show} onPress={() => setVisible(true)} />
      <ConfirmSheet
        visible={visible}
        title={copy.title}
        message={copy.message}
        confirmLabel={copy.confirm}
        cancelLabel={copy.cancel}
        destructive={destructive}
        onConfirm={close}
        onCancel={close}
      />
    </>
  );
}

const syncStates: RecordSyncState[] = ['on_device', 'sending', 'synced', 'not_sent'];

export const galleryEntries: GalleryEntry[] = [
  {
    id: 'button',
    title: 'Button',
    states: {
      primary: () => <Button label={b.save} accessibilityHint={b.saveHint} onPress={noop} />,
      dark: () => <Button variant="dark" label={b.continue} onPress={noop} />,
      secondary: () => <Button variant="secondary" label={b.addSwimmer} onPress={noop} />,
      stop: () => <Button variant="stop" label={b.stop} onPress={noop} />,
      ghost: () => <Button variant="ghost" label={b.history} onPress={noop} />,
      loading: () => <Button label={b.save} loading loadingLabel={b.saving} onPress={noop} />,
      unavailable: () => <Button label={b.authorize} disabledReason={b.guardianOnly} onPress={noop} />,
      timing: () => (
        <View style={{ flexDirection: 'row', gap: space[2], alignSelf: 'stretch' }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" size="timing" label={b.split} onPress={noop} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button variant="stop" size="timing" label={b.stop} onPress={noop} />
          </View>
        </View>
      ),
    },
  },
  {
    id: 'textField',
    title: 'TextField',
    states: {
      rest: () => <TextField {...tf.rest} onChangeText={noop} />,
      help: () => <TextField {...tf.help} value="" onChangeText={noop} />,
      error: () => <TextField {...tf.error} onChangeText={noop} />,
      protected: () => <TextField protected {...tf.protected} />,
    },
  },
  {
    id: 'tag',
    title: 'Tag',
    states: {
      neutral: () => <Tag label={tg.neutral} />,
      outline: () => <Tag variant="outline" label={tg.outline} />,
      info: () => <Tag variant="info" icon="emoji_events" label={tg.info} />,
      ok: () => <Tag variant="ok" icon="verified_user" label={tg.ok} />,
      warn: () => <Tag variant="warn" icon="schedule" label={tg.warn} />,
    },
  },
  {
    id: 'icon',
    title: 'Icon',
    states: {
      'icon-md': () => <IconSet size="icon-md" />,
      'icon-sm': () => <IconSet size="icon-sm" />,
    },
  },
  {
    id: 'stepHeader',
    title: 'StepHeader',
    states: {
      first: () => <FullWidth><StepHeader step={1} total={sh.total} title={sh.first} onBack={noop} /></FullWidth>,
      middle: () => <FullWidth><StepHeader step={2} total={sh.total} title={sh.middle} onBack={noop} /></FullWidth>,
      last: () => <FullWidth><StepHeader step={4} total={sh.total} title={sh.last} onBack={noop} /></FullWidth>,
    },
  },
  {
    id: 'stateView',
    title: 'StateView',
    states: {
      loading: () => (
        <FullWidth>
          <StateView kind="loading" />
        </FullWidth>
      ),
      empty: () => (
        <FullWidth>
          <StateView kind="empty" {...sv.empty} />
        </FullWidth>
      ),
      'empty-group': () => (
        <FullWidth>
          <StateView kind="empty" icon="group" {...sv.empty} />
        </FullWidth>
      ),
      error: () => (
        <FullWidth>
          <StateView
            kind="error"
            title={sv.error.title}
            message={sv.error.message}
            action={{ label: sv.error.action, onPress: noop }}
          />
        </FullWidth>
      ),
      offline: () => (
        <FullWidth>
          <StateView kind="offline" {...sv.offline} />
        </FullWidth>
      ),
      denied: () => (
        <FullWidth>
          <StateView
            kind="denied"
            title={sv.denied.title}
            message={sv.denied.message}
            action={{ label: sv.denied.action, onPress: noop }}
          />
        </FullWidth>
      ),
    },
  },
  {
    id: 'syncStatus',
    title: 'SyncStatus',
    states: {
      ...Object.fromEntries(
        syncStates.map((state) => [state, () => <SyncStatus state={state} onRetry={noop} />]),
      ),
      'not_sent con mensaje': () => (
        <SyncStatus state="not_sent" onRetry={noop} message={t('sync.retry_row_missing')} />
      ),
    },
  },
  {
    id: 'confirmSheet',
    title: 'ConfirmSheet',
    states: {
      stop: () => <ConfirmSheetPreview copy={cs.stop} destructive />,
      primary: () => <ConfirmSheetPreview copy={cs.primary} destructive={false} />,
    },
  },
];
