import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { spokenTime } from '../../../core/time';
import { SwimmerRow, Tag, TimeValue } from '../../../core/ui';
import '../i18n';
import type { AthleteAuthorization, AthleteRow } from './athleteTypes';

export type AthleteTableProps = {
  athletes: AthleteRow[];
  // The name of the personal best column, for example "MP Libre 50" (see personalBestLabel).
  bestLabel: string;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  // The list of SwimmerRow of the compact layout instead of the table.
  compact?: boolean;
};

export const athleteTableColors: {
  background: ColorToken;
  selected: ColorToken;
  header: ColorToken;
  text: ColorToken;
  divider: ColorToken;
} = {
  background: 'surface-1',
  selected: 'primary-tint',
  header: 'ink-muted',
  text: 'ink',
  divider: 'border',
};

// Relative widths of the columns: athlete, category, group, coach, authorization, time.
const flex = [2.2, 1.2, 1.3, 1.5, 1.3, 1.2] as const;

const authorizationVariant: Record<AthleteAuthorization, 'ok' | 'warn'> = { valid: 'ok', pending: 'warn' };
const authorizationLabel = (value: AthleteAuthorization) => t(`schoolConsole.table.${value === 'valid' ? 'valid' : 'pending'}`);

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

export function AthleteTable({ athletes, bestLabel, selectedId = null, onSelect, compact = false }: AthleteTableProps) {
  const { colors, space, radius, size, typography } = useTheme();

  const frame = {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors[athleteTableColors.background],
  } as const;
  const divider = { borderBottomWidth: 1, borderBottomColor: colors[athleteTableColors.divider] } as const;

  if (compact) {
    return (
      <View style={frame}>
        {athletes.map((athlete, index) => (
          <View key={athlete.id} style={index < athletes.length - 1 ? divider : undefined}>
            <SwimmerRow
              name={athlete.name}
              initials={athlete.initials}
              color={athlete.color}
              detail={[athlete.category, athlete.group, athlete.coach].join(' · ')}
              bestTime={athlete.bestTime}
              bestTimeLabel={bestLabel}
              tag={{ label: authorizationLabel(athlete.authorization), variant: authorizationVariant[athlete.authorization] }}
              selected={athlete.id === selectedId}
              onPress={() => onSelect(athlete.id)}
            />
          </View>
        ))}
      </View>
    );
  }

  const header = [
    t('schoolConsole.table.athlete'),
    t('schoolConsole.table.category'),
    t('schoolConsole.table.group'),
    t('schoolConsole.table.coach'),
    t('schoolConsole.table.authorization'),
    bestLabel,
  ];
  const cell = { paddingHorizontal: space[2] } as const;

  return (
    <View style={frame}>
      <View style={[{ flexDirection: 'row', alignItems: 'flex-end', padding: space[3] }, divider]}>
        {header.map((column, index) => (
          <Text
            key={index}
            style={[
              typography.label,
              cell,
              { flex: flex[index], color: colors[athleteTableColors.header], textAlign: index === 5 ? 'right' : 'left' },
            ]}
          >
            {column}
          </Text>
        ))}
      </View>
      {athletes.map((athlete, index) => {
        const selected = athlete.id === selectedId;
        const best =
          athlete.bestTime === null ? t('schoolConsole.table.no_best') : spokenTime(athlete.bestTime);
        const text = { color: colors[athleteTableColors.text] };
        return (
          <Pressable
            key={athlete.id}
            accessibilityRole="button"
            accessibilityLabel={[
              athlete.name,
              athlete.category,
              athlete.group,
              athlete.coach,
              authorizationLabel(athlete.authorization),
              t('schoolConsole.table.best_spoken', { label: bestLabel, time: best }),
            ].join(', ')}
            accessibilityState={{ selected }}
            onPress={() => onSelect(athlete.id)}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: size['target-min'],
                padding: space[3],
                backgroundColor: colors[athleteTableColors[selected ? 'selected' : 'background']],
              },
              index < athletes.length - 1 && divider,
            ]}
          >
            <View {...hidden} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[typography['body-strong'], cell, text, { flex: flex[0] }]}>{athlete.name}</Text>
              <Text style={[typography.body, cell, text, { flex: flex[1] }]}>{athlete.category}</Text>
              <Text style={[typography.body, cell, text, { flex: flex[2] }]}>{athlete.group}</Text>
              <Text style={[typography.body, cell, text, { flex: flex[3] }]}>{athlete.coach}</Text>
              <View style={[cell, { flex: flex[4] }]}>
                <Tag label={authorizationLabel(athlete.authorization)} variant={authorizationVariant[athlete.authorization]} />
              </View>
              <View style={[cell, { flex: flex[5], alignItems: 'flex-end' }]}>
                <TimeValue value={athlete.bestTime} size="time-sm" />
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
