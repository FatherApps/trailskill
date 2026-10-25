import { router, useLocalSearchParams } from 'expo-router';
import { Fragment, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { ThemeProvider, useTheme, type ThemeName } from '../../../core/theme';
import { Button, StateView, type GalleryEntry } from '../../../core/ui';
import { findGalleryEntry } from '../_layout';

type Option<T extends string> = { value: T; label: string };

// A wrapping radio group: an entry can have more states than fit in one row.
function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, space, radius, size, typography } = useTheme();

  return (
    <View style={{ gap: space[2] }}>
      <Text style={[typography.label, { color: colors['ink-muted'] }]}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={{
                minHeight: size['target-min'],
                borderRadius: radius.full,
                paddingHorizontal: space[4],
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                backgroundColor: colors[selected ? 'primary' : 'surface-1'],
                borderColor: selected ? colors.primary : colors.border,
              }}
            >
              <Text style={[typography.label, { color: colors[selected ? 'on-primary' : 'ink'] }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Reads its colors from the preview theme, so it must render inside the forced ThemeProvider.
function PreviewBox({ children }: { children: ReactNode }) {
  const { colors, space, radius } = useTheme();

  return (
    <View
      testID="gallery-preview"
      style={{
        backgroundColor: colors['surface-1'],
        borderRadius: radius.md,
        padding: space[4],
        alignItems: 'flex-start',
      }}
    >
      {children}
    </View>
  );
}

function Body({
  entry,
  themeName,
  fontScale,
  onTheme,
  onFontScale,
}: {
  entry: GalleryEntry | undefined;
  themeName: ThemeName;
  fontScale: '1' | '2';
  onTheme: (value: ThemeName) => void;
  onFontScale: (value: '1' | '2') => void;
}) {
  const { colors, space, typography } = useTheme();
  const [stateKey, setStateKey] = useState(() => Object.keys(entry?.states ?? {})[0]);

  const back = (
    <Button
      variant="ghost"
      label={t('common.back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );

  return (
    <ScrollView
      testID="gallery-screen"
      style={{ backgroundColor: colors['surface-0'] }}
      contentContainerStyle={{
        padding: space[5],
        gap: space[4],
      }}
    >
      <View style={{ alignItems: 'flex-start' }}>{back}</View>
      {entry === undefined ? (
        <StateView kind="empty" title={t('dev.gallery.not_found')} message={t('dev.gallery.not_found_hint')} />
      ) : (
        <>
          <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
            {entry.title}
          </Text>
          <Choice
            label={t('dev.gallery.state')}
            options={Object.keys(entry.states).map((key) => ({
              value: key,
              label: key,
            }))}
            value={stateKey}
            onChange={setStateKey}
          />
          <Choice
            label={t('dev.gallery.theme')}
            options={[
              { value: 'light', label: t('dev.gallery.light') },
              { value: 'dark', label: t('dev.gallery.dark') },
            ]}
            value={themeName}
            onChange={onTheme}
          />
          <Choice
            label={t('dev.gallery.font_scale')}
            options={[
              { value: '1', label: t('dev.gallery.scale_normal') },
              { value: '2', label: t('dev.gallery.scale_double') },
            ]}
            value={fontScale}
            onChange={onFontScale}
          />
          <ThemeProvider name={themeName} fontScale={Number(fontScale)}>
            {/* Keyed by state: a preview that holds its own state must not carry it over to the next state. */}
            <PreviewBox>
              <Fragment key={stateKey}>{entry.states[stateKey]?.()}</Fragment>
            </PreviewBox>
          </ThemeProvider>
        </>
      )}
    </ScrollView>
  );
}

export default function GalleryEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [themeName, setThemeName] = useState<ThemeName>(useTheme().name);
  const [fontScale, setFontScale] = useState<'1' | '2'>('1');

  const entry = findGalleryEntry(id);

  // Remount per entry: the chosen state key belongs to the previous entry when the id changes in place.
  return (
    <Body
      key={entry?.id}
      entry={entry}
      themeName={themeName}
      fontScale={fontScale}
      onTheme={setThemeName}
      onFontScale={setFontScale}
    />
  );
}
