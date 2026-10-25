import { Text } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import '../i18n';
import { ConsoleLayout } from '../components/ConsoleLayout';
import type { ConsoleDestinationId } from '../components/ConsoleNav';
import { athletesScreenColors } from './AthletesScreen';

export type EmptySectionScreenProps = {
  width: number;
  schoolName: string;
  sectionId: ConsoleDestinationId;
  onNavigate: (id: ConsoleDestinationId) => void;
  scrollEnabled?: boolean;
};

// A section that has no screen yet: the shell with only its title.
export function EmptySectionScreen({ width, schoolName, sectionId, onNavigate, scrollEnabled }: EmptySectionScreenProps) {
  const { colors, typography } = useTheme();
  // Provisional: the settings screen will hold the categories, so its title says so while the destination stays "Ajustes".
  const title = sectionId === 'settings' ? t('schoolConsole.sections.settings_title') : t(`schoolConsole.nav.${sectionId}`);
  return (
    <ConsoleLayout width={width} schoolName={schoolName} activeId={sectionId} onSelect={onNavigate} scrollEnabled={scrollEnabled}>
      <Text
        accessibilityRole="header"
        numberOfLines={1} adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[typography['title-lg'], { color: colors[athletesScreenColors.title] }]}
      >
        {title}
      </Text>
    </ConsoleLayout>
  );
}
