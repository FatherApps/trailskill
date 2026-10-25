import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import '../i18n';

export type AthleteIndicatorsProps = {
  active: number;
  pendingAuthorization: number;
  measurementsThisWeek: number;
  toReview: number;
};

export const athleteIndicatorsColors: { card: ColorToken; label: ColorToken; value: ColorToken } = {
  card: 'surface-1',
  label: 'ink-muted',
  value: 'ink',
};

const hidden = { importantForAccessibility: 'no', accessibilityElementsHidden: true } as const;

// Four stat cards. Presentational: the numbers arrive by props.
export function AthleteIndicators({ active, pendingAuthorization, measurementsThisWeek, toReview }: AthleteIndicatorsProps) {
  const { colors, space, radius, typography } = useTheme();
  const items = [
    ['active', active],
    ['pending_authorization', pendingAuthorization],
    ['measurements_week', measurementsThisWeek],
    ['to_review', toReview],
  ] as const;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
      {items.map(([key, value]) => {
        const label = t(`schoolConsole.indicators.${key}`);
        return (
          <View
            key={key}
            accessible
            accessibilityLabel={t('schoolConsole.indicators.spoken', { label, value })}
            style={{
              // Cards share the row and wrap when the width does not fit 150 each; 150 is not a token.
              flexGrow: 1,
              flexBasis: 150,
              paddingVertical: space[3],
              paddingHorizontal: space[5],
              borderRadius: radius.md,
              backgroundColor: colors[athleteIndicatorsColors.card],
            }}
          >
            <Text {...hidden} style={[typography.caption, { color: colors[athleteIndicatorsColors.label] }]}>
              {label}
            </Text>
            {/* Gap: the reference uses 28/32 display; the closest token is title-lg (32/36). */}
            <Text {...hidden} style={[typography['title-lg'], { color: colors[athleteIndicatorsColors.value] }]}>
              {value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
