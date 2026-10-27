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
  // Back is always on screen, so the caller must say where it goes.
  onBack: () => void;
  // Below the school and authorization rows, inside the band: the event chips.
  children?: ReactNode;
};

// The neutral brand colour of the profile band when no athlete colour applies; the screen's states without content share it.
export const profileBandColor: ColorCardColor = 'sky';

// The board draws the ring white at 50 %; that is not a token, so it takes the nearest opaque one (maintainer decision).
export const profileHeaderColors: { ring: ColorToken } = { ring: 'surface-1' };

// The ring of VibPerfil (170 wide): decoration only, so it is a local constant, not a token (maintainer decision).
const DECORATIVE_RING_SIZE = 170;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  // Over the back-button row: the sync tag sits at the right of the button.
  sync: { position: 'absolute', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
});

export function ProfileHeader({
  name,
  category,
  schools,
  schoolId,
  onSchoolChange,
  authorization,
  updatedMinutesAgo,
  color = profileBandColor,
  onBack,
  children,
}: ProfileHeaderProps) {
  const { colors, space, size, radius } = useTheme();
  const school = schools.find((item) => item.id === schoolId);
  const valid = authorization === 'valid';

  return (
    <ColorHeader
      color={color}
      title={name}
      subtitle={[category, school?.name].filter(Boolean).join(' · ')}
      onBack={onBack}
    >
      {/* Decorative and out of the layout. A children slot cannot go behind the title, so the box shows only the strip
          of the ring beside the back button (the title starts below it); the sync tag draws over it. */}
      <View
        testID="profile-ring-clip"
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: DECORATIVE_RING_SIZE,
          height: space[4] + size['target-min'] + space[2],
          overflow: 'hidden',
        }}
      >
        <View
          testID="profile-ring"
          style={{
            position: 'absolute',
            top: -space[5],
            right: -space[8],
            width: DECORATIVE_RING_SIZE,
            height: DECORATIVE_RING_SIZE,
            borderRadius: radius.full,
            borderWidth: space[5],
            borderColor: colors[profileHeaderColors.ring],
          }}
        />
      </View>
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
