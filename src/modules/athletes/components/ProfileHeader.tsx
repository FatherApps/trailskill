import { StyleSheet, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import type { ColorToken } from '../../../core/theme';
import { useTheme } from '../../../core/theme';
import { Segmented, Tag } from '../../../core/ui';
import '../i18n';

export type ProfileHeaderProps = {
  name: string;
  category: string;
  schools: { id: string; name: string }[];
  schoolId: string;
  // Shown only with several schools.
  onSchoolChange?: (schoolId: string) => void;
  authorization: 'valid' | 'pending';
  // Minutes since the last sync; `null` when unknown.
  updatedMinutesAgo: number | null;
};

export const profileHeaderColors: {
  background: ColorToken;
  title: ColorToken;
  subtitle: ColorToken;
  updated: ColorToken;
} = { background: 'surface-0', title: 'ink', subtitle: 'ink-muted', updated: 'ink-muted' };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
});

export function ProfileHeader({
  name,
  category,
  schools,
  schoolId,
  onSchoolChange,
  authorization,
  updatedMinutesAgo,
}: ProfileHeaderProps) {
  const { colors, space, typography } = useTheme();
  const school = schools.find((item) => item.id === schoolId);
  const valid = authorization === 'valid';

  return (
    <View style={{ gap: space[2] }}>
      <View>
        <Text accessibilityRole="header" style={[typography.title, { color: colors[profileHeaderColors.title] }]}>
          {name}
        </Text>
        <Text style={[typography.caption, { color: colors[profileHeaderColors.subtitle] }]}>
          {[category, school?.name].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {schools.length > 1 && (
        <Segmented
          accessibilityLabel={t('athletes.profile.school')}
          options={schools.map((item) => ({ value: item.id, label: item.name }))}
          value={schoolId}
          onChange={(id) => onSchoolChange?.(id)}
        />
      )}
      <View style={[styles.row, { gap: space[2] }]}>
        {/* The UI says "autorización"; "consentimiento" is for legal text (design-system voice rule). */}
        <Tag
          variant={valid ? 'ok' : 'warn'}
          icon={valid ? 'verified_user' : 'schedule'}
          label={t(valid ? 'athletes.profile.authorization_valid' : 'athletes.profile.authorization_pending')}
        />
        {updatedMinutesAgo !== null && (
          <Text style={[typography.caption, { color: colors[profileHeaderColors.updated] }]}>
            {updatedMinutesAgo === 0
              ? t('athletes.profile.updated_now')
              : t('athletes.profile.updated', { count: updatedMinutesAgo })}
          </Text>
        )}
      </View>
    </View>
  );
}
