import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import {
  lockoutSeconds,
  themeModes,
  timePrecisions,
  type ThemeMode,
  type TimePrecision,
  type TimingButtonPreferences,
} from '../../../core/preferences';
import { useTheme } from '../../../core/theme';
import { formatMillis } from '../../../core/time';
import { Banner, Button, IconButton, Segmented } from '../../../core/ui';
import '../i18n';

export type SettingsScreenProps = {
  themeMode: ThemeMode;
  timePrecision: TimePrecision;
  onThemeModeChange: (mode: ThemeMode) => void;
  onTimePrecisionChange: (precision: TimePrecision) => void;
  onBack: () => void;
  /** The headset or volume keys; null where the phone cannot use them (iOS, or a build without the module). */
  buttons: SettingsButtonsView | null;
};

export type ButtonKey = 'start' | 'split';

export type SettingsButtonsView = {
  settings: TimingButtonPreferences;
  /** Names of the keys, as people know them. */
  startKeyName: string;
  splitKeyName: string;
  /** The external key devices connected now, by name. */
  keyboards: string[];
  /** The key being chosen: the next key pressed becomes it. */
  learning: ButtonKey | null;
  onChange: (changes: Partial<TimingButtonPreferences>) => void;
  onLearn: (key: ButtonKey) => void;
  onCancelLearn: () => void;
};

// A fixed synthetic time for the example under the precision choice.
const EXAMPLE_MILLIS = 65_372;

function Section({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <Text accessibilityRole="header" style={[typography.subtitle, { color: colors.ink }]}>
        {label}
      </Text>
      {children}
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{hint}</Text>
    </View>
  );
}

function KeyRow({ label, keyName, learning, onLearn, onCancel }: { label: string; keyName: string; learning: boolean; onLearn: () => void; onCancel: () => void }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <Text style={[typography.body, { color: colors.ink }]}>{t('settings.buttons.key_row', { action: label, key: keyName })}</Text>
      {learning ? (
        <>
          <Banner variant="info">{t('settings.buttons.learning')}</Banner>
          <Button variant="ghost" label={t('settings.buttons.cancel')} onPress={onCancel} />
        </>
      ) : (
        <Button variant="secondary" label={t('settings.buttons.change', { action: label })} onPress={onLearn} />
      )}
    </View>
  );
}

function ButtonsSettings({ view }: { view: SettingsButtonsView }) {
  const { colors, space, typography } = useTheme();
  const { settings } = view;
  const onOff = [
    { value: 'on', label: t('settings.buttons.on') },
    { value: 'off', label: t('settings.buttons.off') },
  ];
  return (
    <>
      <Section label={t('settings.buttons.label')} hint={t('settings.buttons.hint')}>
        <Segmented
          accessibilityLabel={t('settings.buttons.label')}
          value={settings.enabled ? 'on' : 'off'}
          onChange={(value) => view.onChange({ enabled: value === 'on' })}
          options={onOff}
        />
        <Text style={[typography.caption, { color: colors.ink }]}>
          {view.keyboards.length > 0
            ? t('settings.buttons.connected', { devices: view.keyboards.join(', ') })
            : t('settings.buttons.not_connected')}
        </Text>
      </Section>
      {settings.enabled && (
        <>
          <Section label={t('settings.buttons.keys_label')} hint={t('settings.buttons.keys_hint')}>
            <View style={{ gap: space[4] }}>
              <KeyRow
                label={t('settings.buttons.start')}
                keyName={view.startKeyName}
                learning={view.learning === 'start'}
                onLearn={() => view.onLearn('start')}
                onCancel={view.onCancelLearn}
              />
              <KeyRow
                label={t('settings.buttons.split')}
                keyName={view.splitKeyName}
                learning={view.learning === 'split'}
                onLearn={() => view.onLearn('split')}
                onCancel={view.onCancelLearn}
              />
            </View>
          </Section>
          <Section label={t('settings.buttons.lockout_label')} hint={t('settings.buttons.lockout_hint')}>
            <Segmented
              accessibilityLabel={t('settings.buttons.lockout_label')}
              value={String(settings.lockoutSeconds)}
              onChange={(value) => view.onChange({ lockoutSeconds: Number(value) })}
              options={lockoutSeconds.map((seconds) => ({ value: String(seconds), label: t('settings.buttons.seconds', { count: seconds }) }))}
            />
          </Section>
          <Section label={t('settings.buttons.vibrate_label')} hint={t('settings.buttons.vibrate_hint')}>
            <Segmented
              accessibilityLabel={t('settings.buttons.vibrate_label')}
              value={settings.vibrate ? 'on' : 'off'}
              onChange={(value) => view.onChange({ vibrate: value === 'on' })}
              options={onOff}
            />
          </Section>
        </>
      )}
    </>
  );
}

// Presentational: the caller reads and saves the preferences.
export function SettingsScreen({ themeMode, timePrecision, onThemeModeChange, onTimePrecisionChange, onBack, buttons }: SettingsScreenProps) {
  const { colors, space, typography } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[2] }}>
        <IconButton icon="arrow_back" label={t('settings.back')} onPress={onBack} />
        <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
          {t('settings.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ gap: space[6], padding: space[4] }}>
        <Section label={t('settings.theme.label')} hint={t('settings.theme.hint')}>
          <Segmented
            accessibilityLabel={t('settings.theme.label')}
            value={themeMode}
            onChange={onThemeModeChange}
            options={themeModes.map((mode) => ({ value: mode, label: t(`settings.theme.${mode}`) }))}
          />
        </Section>
        <Section label={t('settings.precision.label')} hint={t('settings.precision.hint')}>
          <Segmented
            accessibilityLabel={t('settings.precision.label')}
            value={timePrecision}
            onChange={onTimePrecisionChange}
            options={timePrecisions.map((precision) => ({ value: precision, label: t(`settings.precision.${precision}`) }))}
          />
          <Text style={[typography['time-md'], { color: colors.ink }]}>
            {t('settings.precision.example', { time: formatMillis(EXAMPLE_MILLIS, { precision: timePrecision }) })}
          </Text>
        </Section>
        {buttons && <ButtonsSettings view={buttons} />}
      </ScrollView>
    </SafeAreaView>
  );
}
