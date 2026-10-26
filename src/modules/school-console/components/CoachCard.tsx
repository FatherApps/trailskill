import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Button, ColorCard, Tag } from '../../../core/ui';
import '../i18n';
import { MIN_CARD_WIDTH, TWO_COLUMN_BASIS } from './coachGrid';
import type { CoachRow } from './CoachList';

export type CoachCardProps = {
  coach: CoachRow;
  // True for a single column: the card takes the whole row instead of sharing it.
  oneColumn: boolean;
  // False until a coach can really be deactivated: the action is shown disabled, not hidden.
  deactivateAvailable: boolean;
  // Only reports the press: the confirmation and the deactivation itself belong to the caller.
  onDeactivate: (id: string) => void;
  // Caps the card so it does not grow past the width of a card that shares its row (see coachGrid).
  maxWidth?: number;
};

const coachCardColors: {
  dot: ColorToken;
  dotText: ColorToken;
  pendingDot: ColorToken;
  pendingBackground: ColorToken;
  pendingBorder: ColorToken;
  pendingTitle: ColorToken;
  pendingDetail: ColorToken;
} = {
  dot: 'surface-1',
  dotText: 'ink',
  pendingDot: 'surface-2',
  pendingBackground: 'surface-1',
  pendingBorder: 'border-strong',
  pendingTitle: 'ink',
  pendingDetail: 'ink-muted',
};

// The initials of the coach in a round chip; the name is already read, so screen readers skip it.
function Initials({ initials, background }: { initials: string; background: ColorToken }) {
  const { colors, space, radius, size, typography } = useTheme();
  if (!initials) return null;

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        minWidth: size['target-min'],
        minHeight: size['target-min'],
        paddingHorizontal: space[1],
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        backgroundColor: colors[background],
      }}
    >
      <Text style={[typography.label, { color: colors[coachCardColors.dotText] }]}>{initials}</Text>
    </View>
  );
}

// The initials next to the state tag; Tag aligns itself to the start of its row, so the wrapper centres it with the initials.
// The row never wraps, so the tag cannot fall below the initials and push the actions around.
function InitialsWithTag({ initials, background, children }: { initials: string; background: ColorToken; children: ReactNode }) {
  const { space } = useTheme();

  return (
    <View testID="initials-tag-row" style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Initials initials={initials} background={background} />
      <View style={{ alignSelf: 'center' }}>{children}</View>
    </View>
  );
}

// One coach: a colour card (stable colour per coach) for an active one, a dashed outline for a pending invitation.
export function CoachCard({ coach, oneColumn, deactivateAvailable, onDeactivate, maxWidth }: CoachCardProps) {
  const { colors, space, radius, typography } = useTheme();
  const cell = oneColumn ? { flexBasis: '100%' as const } : { flexGrow: 1, flexBasis: TWO_COLUMN_BASIS, minWidth: MIN_CARD_WIDTH, maxWidth };
  const name = coach.name ?? t('schoolConsole.common.no_data');
  const groups = coach.groups.length > 0 ? coach.groups.join(' · ') : t('schoolConsole.coaches.no_groups');

  if (coach.status === 'pending') {
    const status = t('schoolConsole.coaches.status.pending');
    return (
      <View testID="coach-card" style={cell}>
        <View
          testID="pending-card"
          accessible
          accessibilityLabel={[coach.name, status, groups].filter(Boolean).join(', ')}
          style={{
            gap: space[1],
            padding: space[4],
            borderRadius: radius.md,
            // The dashed border is not alone: the tag below says it in words.
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: colors[coachCardColors.pendingBorder],
            backgroundColor: colors[coachCardColors.pendingBackground],
          }}
        >
          <Text style={[typography.title, { color: colors[coachCardColors.pendingTitle] }]}>{name}</Text>
          <Text style={[typography.caption, { color: colors[coachCardColors.pendingDetail] }]}>{groups}</Text>
          <InitialsWithTag initials={coach.initials} background={coachCardColors.pendingDot}>
            <Tag label={status} variant="warn" icon="schedule" />
          </InitialsWithTag>
        </View>
      </View>
    );
  }

  const detail = `${groups} · ${t('schoolConsole.coaches.athletes', { count: coach.athleteCount })}`;

  return (
    <View testID="coach-card" style={cell}>
      <ColorCard color={coach.color} title={name} detail={detail}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
          <InitialsWithTag initials={coach.initials} background={coachCardColors.dot}>
            <Tag label={t('schoolConsole.coaches.status.active')} variant="ok" />
          </InitialsWithTag>
          <Button
            variant="ghost"
            label={t('schoolConsole.coaches.deactivate')}
            disabledReason={deactivateAvailable ? undefined : t('schoolConsole.coaches.deactivate_unavailable')}
            accessibilityHint={t('schoolConsole.coaches.deactivate_hint', { name })}
            onPress={() => onDeactivate(coach.id)}
          />
        </View>
      </ColorCard>
    </View>
  );
}
