import { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { spokenTime } from '../../../core/time';
import { SwimmerRow, Tag, TimeValue } from '../../../core/ui';
import '../i18n';
import type { AthleteAuthorization, AthleteRow } from './athleteTypes';
import { useTextScale } from './textScale';

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

// The five columns: the three text columns share what is left (relative widths); the tag and the time keep their
// own width, which grows with the text scale, and never shrink.
const textFlex = [2.2, 1.2, 2] as const;
const TAG_WIDTH = 112;
const TIME_WIDTH = 88;

// Narrowest the table can be at normal text size without breaking a word or a time: the longest word of each text
// column (about 75 + 55 + 60 dp) plus the tag (112) and time (88) columns, their paddings and the row padding, with margin
// for longer names. Below `MIN_TABLE_WIDTH * text scale` (the width of the table's own box) the list form is used.
const MIN_TABLE_WIDTH = 540;

const authorizationVariant: Record<AthleteAuthorization, 'ok' | 'warn'> = { valid: 'ok', pending: 'warn' };
const authorizationLabel = (value: AthleteAuthorization) => t(`schoolConsole.table.${value === 'valid' ? 'valid' : 'pending'}`);

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

export function AthleteTable({ athletes, bestLabel, selectedId = null, onSelect, compact = false }: AthleteTableProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const scale = useTextScale();
  const [width, setWidth] = useState<number | null>(null);
  // Until the width is known the table is shown.
  const list = compact || (width !== null && width < MIN_TABLE_WIDTH * scale);

  const frame = {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors[athleteTableColors.background],
  } as const;
  const divider = { borderBottomWidth: 1, borderBottomColor: colors[athleteTableColors.divider] } as const;

  const measured = { testID: 'athlete-table', onLayout: (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width) };

  if (list) {
    return (
      <View {...measured} style={frame}>
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
    t('schoolConsole.table.group_coach'),
    t('schoolConsole.table.authorization'),
    bestLabel,
  ];
  const cell = { paddingHorizontal: space[2] } as const;

  const tagColumn = { flexShrink: 0, flexGrow: 0, width: TAG_WIDTH * scale } as const;
  const timeColumn = { flexShrink: 0, flexGrow: 0, width: TIME_WIDTH * scale } as const;

  return (
    <View {...measured} style={frame}>
      <View style={[{ flexDirection: 'row', alignItems: 'flex-end', padding: space[3] }, divider]}>
        {header.map((column, index) => (
          <Text
            key={index}
            style={[
              typography.label,
              cell,
              index === 3 ? tagColumn : index === 4 ? timeColumn : { flex: textFlex[index] },
              { color: colors[athleteTableColors.header], textAlign: index === 4 ? 'right' : 'left' },
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
              <Text style={[typography['body-strong'], cell, text, { flex: textFlex[0] }]}>{athlete.name}</Text>
              <Text style={[typography.body, cell, text, { flex: textFlex[1] }]}>{athlete.category}</Text>
              <Text style={[typography.body, cell, text, { flex: textFlex[2] }]}>{`${athlete.group} · ${athlete.coach}`}</Text>
              <View style={[cell, tagColumn]}>
                <Tag label={authorizationLabel(athlete.authorization)} variant={authorizationVariant[athlete.authorization]} />
              </View>
              <View style={[cell, timeColumn, { alignItems: 'flex-end' }]}>
                <TimeValue value={athlete.bestTime} size="time-sm" />
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
