import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Button, ColorCard, Tag } from '../../../core/ui';
import '../i18n';
import type { CoachRow } from './CoachList';

export type CoachCardProps = {
  coach: CoachRow;
  // Width of the card in its row: half of it in two columns, all of it in one.
  basis: '48%' | '100%';
  // False until a coach can really be deactivated: the action is shown disabled, not hidden.
  deactivateAvailable: boolean;
  // Only reports the press: the confirmation and the deactivation itself belong to the caller.
  onDeactivate: (id: string) => void;
};

export const coachCardColors: {
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

// One coach: a colour card (stable colour per coach) for an active one, a dashed outline for a pending invitation.
export function CoachCard({ coach, basis, deactivateAvailable, onDeactivate }: CoachCardProps) {
  const { colors, space, radius, typography } = useTheme();
  const name = coach.name ?? t('schoolConsole.common.no_data');
  const detail = `${coach.groups.length > 0 ? coach.groups.join(' · ') : t('schoolConsole.coaches.no_groups')} · ${t('schoolConsole.coaches.athletes', { count: coach.athleteCount })}`;

  if (coach.status === 'pending') {
    return (
      <View testID="coach-card" style={{ flexBasis: basis }}>
        <View
          testID="pending-card"
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
          <Text style={[typography.caption, { color: colors[coachCardColors.pendingDetail] }]}>{detail}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
            <Initials initials={coach.initials} background={coachCardColors.pendingDot} />
            {/* Tag aligns itself to the start of its row; the wrapper centres it with the initials. */}
            <View style={{ alignSelf: 'center' }}>
              <Tag label={t('schoolConsole.coaches.status.pending')} variant="warn" icon="schedule" />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View testID="coach-card" style={{ flexBasis: basis }}>
      <ColorCard color={coach.color} title={name} detail={detail}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Initials initials={coach.initials} background={coachCardColors.dot} />
            <View style={{ alignSelf: 'center' }}>
              <Tag label={t('schoolConsole.coaches.status.active')} variant="ok" />
            </View>
          </View>
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
