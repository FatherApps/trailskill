import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '../../../core/i18n';
import type { ColorToken } from '../../../core/theme';
import { useTheme } from '../../../core/theme';
import { ColorHeader, Segmented, Tag, type ColorCardColor } from '../../../core/ui';
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
  // The athlete's colour (same on every screen); a neutral brand colour when the caller has none.
  color?: ColorCardColor;
  // Back is always on screen; a caller without a destination leaves the button inert.
  onBack?: () => void;
  // Below the school and authorization rows, inside the band: the event chips.
  children?: ReactNode;
};

// The board draws the ring white at 50 %; that is not a token, so it takes the nearest opaque one (maintainer decision).
export const profileHeaderColors: { ring: ColorToken } = { ring: 'surface-1' };

const ringSize = 170;
const ringStroke = 20;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  // Over the back-button row: the sync tag sits at the right of the button.
  sync: { position: 'absolute', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
});

const noop = () => {};

export function ProfileHeader({
  name,
  category,
  schools,
  schoolId,
  onSchoolChange,
  authorization,
  updatedMinutesAgo,
  color = 'sky',
  onBack = noop,
  children,
}: ProfileHeaderProps) {
  const { colors, space, size } = useTheme();
  const school = schools.find((item) => item.id === schoolId);
  const valid = authorization === 'valid';

  return (
    <ColorHeader
      color={color}
      title={name}
      subtitle={[category, school?.name].filter(Boolean).join(' · ')}
      onBack={onBack}
    >
      {/* Behind the text: a negative zIndex keeps it above the band's own background but under its children. */}
      <View
        testID="profile-ring"
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{
          position: 'absolute',
          top: 0,
          right: -space[8],
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize,
          borderWidth: ringStroke,
          borderColor: colors[profileHeaderColors.ring],
          zIndex: -1,
        }}
      />
      {updatedMinutesAgo !== null && (
        <View
          style={[
            styles.sync,
            // Stops at the back button, so a long label wraps instead of covering it.
            { top: space[4], left: space[4] + size['target-min'] + space[2], right: space[4], height: size['target-min'] },
          ]}
        >
          <View>
            <Tag
              variant="neutral"
              icon="cloud_done"
              label={
                updatedMinutesAgo === 0
                  ? t('athletes.profile.updated_now')
                  : t('athletes.profile.updated', { count: updatedMinutesAgo })
              }
            />
          </View>
        </View>
      )}
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
      </View>
      {children}
    </ColorHeader>
  );
}
