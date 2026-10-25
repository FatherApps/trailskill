import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { spokenTime } from '../../../core/time';
import { Button, Tag, TimeValue } from '../../../core/ui';
import '../i18n';
import type { AthleteDetailData } from './athleteTypes';

export type AthleteDetailProps = {
  athlete: AthleteDetailData;
  onViewProfile: () => void;
};

export const athleteDetailColors: { background: ColorToken; title: ColorToken; caption: ColorToken; divider: ColorToken } = {
  background: 'surface-1',
  title: 'ink',
  caption: 'ink-muted',
  divider: 'border',
};

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// What the console shows of an athlete: full name, category, authorization, guardian and best marks.
// Never a document number, a document status or a birth date: the data does not even carry them.
export function AthleteDetail({ athlete, onViewProfile }: AthleteDetailProps) {
  const { colors, space, typography } = useTheme();
  const valid = athlete.authorization === 'valid';

  return (
    <View style={{ gap: space[4] }}>
      <Text accessibilityRole="header" style={[typography.title, { color: colors[athleteDetailColors.title] }]}>
        {athlete.name}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        <Tag label={athlete.category} />
        <Tag
          label={t(valid ? 'schoolConsole.detail.authorized' : 'schoolConsole.detail.pending')}
          variant={valid ? 'ok' : 'warn'}
          icon={valid ? 'verified_user' : 'schedule'}
        />
      </View>
      <View style={{ gap: space[1] }}>
        <Text style={[typography.caption, { color: colors[athleteDetailColors.caption] }]}>
          {t('schoolConsole.detail.guardian')}
        </Text>
        <Text style={[typography.body, { color: colors[athleteDetailColors.title] }]}>{athlete.guardian.name}</Text>
        <Text style={[typography.body, { color: colors[athleteDetailColors.caption] }]}>{athlete.guardian.contact}</Text>
      </View>
      <View>
        <Text accessibilityRole="header" style={[typography.label, { color: colors[athleteDetailColors.title] }]}>
          {t('schoolConsole.detail.bests')}
        </Text>
        {athlete.bests.length === 0 ? (
          <Text style={[typography.body, { paddingVertical: space[3], color: colors[athleteDetailColors.caption] }]}>
            {t('schoolConsole.detail.no_bests')}
          </Text>
        ) : (
          athlete.bests.map((best, index) => (
            <View
              key={best.id}
              accessible
              accessibilityLabel={[
                best.event,
                best.time === null ? t('schoolConsole.detail.no_time') : spokenTime(best.time),
                best.source,
              ]
                .filter(Boolean)
                .join(', ')}
              style={[
                { paddingVertical: space[3] },
                index < athlete.bests.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors[athleteDetailColors.divider],
                },
              ]}
            >
              <View {...hidden} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
                <Text style={[typography.body, { flex: 1, color: colors[athleteDetailColors.title] }]}>{best.event}</Text>
                {best.source && <Tag label={best.source} variant="info" />}
                <TimeValue value={best.time} size="time-sm" />
              </View>
            </View>
          ))
        )}
      </View>
      <Button variant="secondary" label={t('schoolConsole.detail.view_profile')} onPress={onViewProfile} />
    </View>
  );
}
