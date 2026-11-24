import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { lockoutSeconds, timePrecisions, type TimePrecision, type TimingButtonPreferences } from '../../../core/preferences';
import { useTheme } from '../../../core/theme';
import { formatMillis } from '../../../core/time';
import { Banner, Button, Segmented } from '../../../core/ui';
import { SettingsFrame } from '../components/SettingsFrame';
import { SettingsSection } from '../components/SettingsSection';
import '../i18n';

// A fixed synthetic time for the example under the precision choice.
const EXAMPLE_MILLIS = 65_372;

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

export type SettingsFreeLapsView = { value: boolean; onChange: (value: boolean) => void };

export type SettingsPrecisionView = { value: TimePrecision; onChange: (value: TimePrecision) => void };

export type StopwatchSettingsScreenProps = {
  /** The precision of the times: always offered, with or without the buttons. */
  precision: SettingsPrecisionView;
  /** Free laps: always offered, with or without the buttons. */
  freeLaps: SettingsFreeLapsView;
  /** The headset or volume keys; null where the phone cannot use them (iOS, or a build without the module). */
  buttons: SettingsButtonsView | null;
  onBack: () => void;
};

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
      <SettingsSection label={t('settings.buttons.label')} hint={t('settings.buttons.hint')}>
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
      </SettingsSection>
      {settings.enabled && (
        <>
          <SettingsSection label={t('settings.buttons.keys_label')} hint={t('settings.buttons.keys_hint')}>
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
          </SettingsSection>
          <SettingsSection label={t('settings.buttons.lockout_label')} hint={t('settings.buttons.lockout_hint')}>
            <Segmented
              accessibilityLabel={t('settings.buttons.lockout_label')}
              value={String(settings.lockoutSeconds)}
              onChange={(value) => view.onChange({ lockoutSeconds: Number(value) })}
              options={lockoutSeconds.map((seconds) => ({ value: String(seconds), label: t('settings.buttons.seconds', { count: seconds }) }))}
            />
          </SettingsSection>
          <SettingsSection label={t('settings.buttons.vibrate_label')} hint={t('settings.buttons.vibrate_hint')}>
            <Segmented
              accessibilityLabel={t('settings.buttons.vibrate_label')}
              value={settings.vibrate ? 'on' : 'off'}
              onChange={(value) => view.onChange({ vibrate: value === 'on' })}
              options={onOff}
            />
          </SettingsSection>
        </>
      )}
    </>
  );
}

// "Cronómetro avanzado": the precision of the times, free laps, and where the phone can use them the headset or volume keys, which key does what, the lockout and the vibration. Presentational.
export function StopwatchSettingsScreen({ precision, freeLaps, buttons, onBack }: StopwatchSettingsScreenProps) {
  const { colors, typography } = useTheme();
  return (
    <SettingsFrame title={t('settings.stopwatch.title')} intro={t('settings.stopwatch.intro')} onBack={onBack}>
      <SettingsSection label={t('settings.precision.label')} hint={t('settings.precision.hint')}>
        <Segmented
          accessibilityLabel={t('settings.precision.label')}
          value={precision.value}
          onChange={precision.onChange}
          options={timePrecisions.map((value) => ({ value, label: t(`settings.precision.${value}`) }))}
        />
        <Text style={[typography['time-md'], { color: colors.ink }]}>
          {t('settings.precision.example', { time: formatMillis(EXAMPLE_MILLIS, { precision: precision.value }) })}
        </Text>
      </SettingsSection>
      <SettingsSection label={t('settings.stopwatch.free_laps_label')} hint={t('settings.stopwatch.free_laps_hint')}>
        <Segmented
          accessibilityLabel={t('settings.stopwatch.free_laps_label')}
          value={freeLaps.value ? 'on' : 'off'}
          onChange={(value) => freeLaps.onChange(value === 'on')}
          options={[
            { value: 'on', label: t('settings.buttons.on') },
            { value: 'off', label: t('settings.buttons.off') },
          ]}
        />
      </SettingsSection>
      {buttons && <ButtonsSettings view={buttons} />}
    </SettingsFrame>
  );
}
