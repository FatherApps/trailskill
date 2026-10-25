import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { spokenTime } from '../../../core/time';
import { SwimmerRow, Tag, TimeValue, useFocusRing } from '../../../core/ui';
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

// One table row: its own component so each keeps its focus state.
function TableRow({
  label,
  selected,
  onPress,
  style,
  children,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      {...focusProps}
      style={[style, ring]}
    >
      {children}
    </Pressable>
  );
}

// Which form the table takes by the width it has: the table, or the list of SwimmerRow. Until the width is known it is the table.
// `onLayout` goes on the element whose width is the table's.
export function useTableForm(compact: boolean) {
  const scale = useTextScale();
  const [width, setWidth] = useState<number | null>(null);
  return {
    list: compact || (width !== null && width < MIN_TABLE_WIDTH * scale),
    onLayout: (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width),
  };
}

// Which corners of a row are rounded when the rows are not inside the one frame of AthleteTable (a virtualized list).
export type RowCorners = { top: boolean; bottom: boolean };

const cornerStyle = (radiusValue: number, corners: RowCorners | undefined) =>
  corners && {
    overflow: 'hidden',
    borderTopLeftRadius: corners.top ? radiusValue : 0,
    borderTopRightRadius: corners.top ? radiusValue : 0,
    borderBottomLeftRadius: corners.bottom ? radiusValue : 0,
    borderBottomRightRadius: corners.bottom ? radiusValue : 0,
  } as const;

// The column names of the table form. `rounded`: its top corners are rounded, for a header outside the frame.
export function AthleteTableHeader({ bestLabel, rounded = false }: { bestLabel: string; rounded?: boolean }) {
  const { colors, space, radius, typography } = useTheme();
  const scale = useTextScale();
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
    <View
      style={[
        { flexDirection: 'row', alignItems: 'flex-end', padding: space[3] },
        { borderBottomWidth: 1, borderBottomColor: colors[athleteTableColors.divider] },
        rounded && { backgroundColor: colors[athleteTableColors.background] },
        cornerStyle(radius.md, rounded ? { top: true, bottom: false } : undefined),
      ]}
    >
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
  );
}

// One athlete, as a table row or as a SwimmerRow of the list form. `last`: no divider below. `corners`: only outside the frame.
export function AthleteTableRow({
  athlete,
  bestLabel,
  selected,
  onSelect,
  list,
  last,
  corners,
}: {
  athlete: AthleteRow;
  bestLabel: string;
  selected: boolean;
  onSelect: (id: string) => void;
  list: boolean;
  last: boolean;
  corners?: RowCorners;
}) {
  const { colors, space, radius, size, typography } = useTheme();
  const scale = useTextScale();
  const divider = { borderBottomWidth: 1, borderBottomColor: colors[athleteTableColors.divider] } as const;
  const noData = t('schoolConsole.common.no_data');
  const coach = athlete.coach ?? noData;

  if (list) {
    return (
      <View
        style={[
          !last && divider,
          corners && { backgroundColor: colors[athleteTableColors.background] },
          cornerStyle(radius.md, corners),
        ]}
      >
        <SwimmerRow
          name={athlete.name}
          initials={athlete.initials}
          color={athlete.color}
          detail={[athlete.category, athlete.group, coach].join(' · ')}
          bestTime={athlete.bestTime}
          bestTimeLabel={bestLabel}
          tag={{ label: authorizationLabel(athlete.authorization), variant: authorizationVariant[athlete.authorization] }}
          selected={selected}
          onPress={() => onSelect(athlete.id)}
        />
      </View>
    );
  }

  const cell = { paddingHorizontal: space[2] } as const;
  const tagColumn = { flexShrink: 0, flexGrow: 0, width: TAG_WIDTH * scale } as const;
  const timeColumn = { flexShrink: 0, flexGrow: 0, width: TIME_WIDTH * scale } as const;
  const best = athlete.bestTime === null ? t('schoolConsole.table.no_best') : spokenTime(athlete.bestTime);
  const text = { color: colors[athleteTableColors.text] };

  return (
    <TableRow
      selected={selected}
      onPress={() => onSelect(athlete.id)}
      label={[
        athlete.name,
        athlete.category,
        athlete.group,
        coach,
        authorizationLabel(athlete.authorization),
        t('schoolConsole.table.best_spoken', { label: bestLabel, time: best }),
      ].join(', ')}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: size['target-min'],
          padding: space[3],
          backgroundColor: colors[athleteTableColors[selected ? 'selected' : 'background']],
        },
        !last && divider,
        cornerStyle(radius.md, corners),
      ]}
    >
      <View {...hidden} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[typography['body-strong'], cell, text, { flex: textFlex[0] }]}>{athlete.name}</Text>
        <Text style={[typography.body, cell, text, { flex: textFlex[1] }]}>{athlete.category}</Text>
        <Text style={[typography.body, cell, text, { flex: textFlex[2] }]}>{`${athlete.group} · ${coach}`}</Text>
        <View style={[cell, tagColumn]}>
          <Tag label={authorizationLabel(athlete.authorization)} variant={authorizationVariant[athlete.authorization]} />
        </View>
        <View style={[cell, timeColumn, { alignItems: 'flex-end' }]}>
          <TimeValue value={athlete.bestTime} size="time-sm" />
        </View>
      </View>
    </TableRow>
  );
}

// The whole table in one frame. For a long list use AthleteTableHeader and AthleteTableRow as the header and the items of a FlatList.
export function AthleteTable({ athletes, bestLabel, selectedId = null, onSelect, compact = false }: AthleteTableProps) {
  const { colors, radius } = useTheme();
  const { list, onLayout } = useTableForm(compact);

  return (
    <View
      testID="athlete-table"
      onLayout={onLayout}
      style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors[athleteTableColors.background] }}
    >
      {!list && <AthleteTableHeader bestLabel={bestLabel} />}
      {athletes.map((athlete, index) => (
        <AthleteTableRow
          key={athlete.id}
          athlete={athlete}
          bestLabel={bestLabel}
          selected={athlete.id === selectedId}
          onSelect={onSelect}
          list={list}
          last={index === athletes.length - 1}
        />
      ))}
    </View>
  );
}
