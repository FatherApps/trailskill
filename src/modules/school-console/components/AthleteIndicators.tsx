import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import '../i18n';
import { useTextScale } from './textScale';

export type AthleteIndicatorsProps = {
  active: number;
  pendingAuthorization: number;
  measurementsThisWeek: number;
  // `null` when it cannot be known: the card says "Sin dato", never 0.
  toReview: number | null;
};

export const athleteIndicatorsColors: { card: ColorToken; label: ColorToken; value: ColorToken } = {
  card: 'surface-1',
  label: 'ink-muted',
  value: 'ink',
};

// Narrowest a card can be at normal text size without breaking a word of its label; it is not a token.
const MIN_CARD_WIDTH = 150;

const hidden = { importantForAccessibility: 'no', accessibilityElementsHidden: true } as const;

// Four stat cards. Presentational: the numbers arrive by props.
export function AthleteIndicators({ active, pendingAuthorization, measurementsThisWeek, toReview }: AthleteIndicatorsProps) {
  const { colors, space, radius, typography } = useTheme();
  const scale = useTextScale();
  const [width, setWidth] = useState<number | null>(null);
  // Equal columns: 4, 2 or 1 per row, the most that keep each card at its minimum width; never 3 + 1.
  const minCard = MIN_CARD_WIDTH * scale;
  const columns = width === null ? null : ([4, 2].find((count) => width >= count * minCard + (count - 1) * space[3]) ?? 1);
  const cardWidth = width === null || columns === null ? null : (width - (columns - 1) * space[3]) / columns;
  const items = [
    ['active', active],
    ['pending_authorization', pendingAuthorization],
    ['measurements_week', measurementsThisWeek],
    ['to_review', toReview],
  ] as const;

  return (
    <View
      testID="athlete-indicators"
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}
    >
      {items.map(([key, value]) => {
        const label = t(`schoolConsole.indicators.${key}`);
        const shown = value ?? t('schoolConsole.common.no_data');
        return (
          <View
            key={key}
            accessible
            accessibilityLabel={t('schoolConsole.indicators.spoken', { label, value: shown })}
            style={{
              // Until the width is known the cards share the row and wrap.
              ...(cardWidth === null ? { flexGrow: 1, flexBasis: MIN_CARD_WIDTH } : { width: cardWidth }),
              paddingVertical: space[3],
              paddingHorizontal: space[5],
              borderRadius: radius.md,
              backgroundColor: colors[athleteIndicatorsColors.card],
            }}
          >
            <Text {...hidden} style={[typography.caption, { color: colors[athleteIndicatorsColors.label] }]}>
              {label}
            </Text>
            {/* Gap: the reference uses 28/32 display; the closest token is title-lg (32/36). The words "Sin dato" use the smaller title so they fit the card. */}
            <Text {...hidden} style={[typography[value === null ? 'title' : 'title-lg'], { color: colors[athleteIndicatorsColors.value] }]}>
              {shown}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
