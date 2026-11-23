import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Icon } from '../../../core/ui';
import '../i18n';

export type AthleteResultSharingRowProps = {
  // The schools the swimmer is active in, in the order to show, each with whether the owner opened the swimmer's results to it.
  schools: { id: string; name: string; shared: boolean }[];
  // The last change did not go through: the switch is back where it was and the generic error shows.
  failed?: boolean;
  onToggle: (schoolId: string, shared: boolean) => void;
};

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
  box: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
});

// The owner's switch per school on the swimmer's profile. The design system has no switch yet: each line uses the checked box of the
// consent card, announced as a switch. No data here: the container reads it.
export function AthleteResultSharingRow({ schools, failed, onToggle }: AthleteResultSharingRowProps) {
  const { colors, space, radius, size, typography } = useTheme();
  return (
    <View style={{ gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors.border }}>
      {schools.map(({ id, name, shared }) => {
        const label = t('athletes.result_sharing.label', { school: name });
        return (
          <Pressable
            key={id}
            accessibilityRole="switch"
            accessibilityLabel={label}
            accessibilityState={{ checked: shared }}
            onPress={() => onToggle(id, !shared)}
            style={[styles.line, { gap: space[3], minHeight: size['target-min'] }]}
          >
            <View
              style={[
                styles.box,
                {
                  width: size['icon-md'],
                  height: size['icon-md'],
                  borderRadius: space[1],
                  borderColor: colors[shared ? 'primary' : 'border-strong'],
                  backgroundColor: shared ? colors.primary : undefined,
                },
              ]}
            >
              {shared && <Icon name="check" size="icon-sm" color="on-primary" />}
            </View>
            <Text style={[typography.body, styles.text, { color: colors.ink }]}>{label}</Text>
          </Pressable>
        );
      })}
      {failed && (
        <Banner variant="warn" icon="error">
          {t('athletes.screen.error.message')}
        </Banner>
      )}
    </View>
  );
}
