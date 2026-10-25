import { router } from 'expo-router';
import { Fragment } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/ui';
import { galleryGroups } from '../_layout';

export default function GalleryIndex() {
  const { colors, space, typography } = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: colors['surface-0'] }}
      contentContainerStyle={{
        padding: space[5],
        gap: space[4],
      }}
    >
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          variant="ghost"
          label={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
        {t('dev.gallery.title')}
      </Text>
      {galleryGroups.map((group) => (
        <Fragment key={group.id}>
          <Text style={[typography.label, { color: colors['ink-muted'] }]}>{group.title}</Text>
          {group.entries.map((entry) => (
            <Button
              key={entry.id}
              variant="secondary"
              label={entry.title}
              onPress={() => router.push(`/gallery/${entry.id}`)}
            />
          ))}
        </Fragment>
      ))}
    </ScrollView>
  );
}
