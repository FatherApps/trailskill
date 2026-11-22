import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, ColorHeader } from '../../../core/ui';
import '../i18n';
import { athleteColor } from '../athleteDisplay';

export type AthleteEditScreenProps = {
  athleteId: string;
  firstName: string;
  lastName: string;
  // The sections of other modules, passed by the route (athletes cannot import accounts: a cycle). Order on screen: photo, data (identity inside it), share code.
  photo?: ReactNode;
  // The editable first and last name, inside "Datos del nadador" (the route passes who may edit it).
  name: ReactNode;
  // The birth date and gender, a flat section inside "Datos del nadador" after the name.
  privateDetails?: ReactNode;
  // The identity document, inside "Datos del nadador".
  identity?: ReactNode;
  shareCode?: ReactNode;
  // Opens the request to relink the times a school kept of an erased swimmer (issue 1251). Absent: the entry is not shown.
  onRelink?: () => void;
  onBack: () => void;
  onDone: () => void;
};

// Presentational: no network, database or repository. Only who manages the swimmer reaches it (the route decides).
export function AthleteEditScreen({ athleteId, firstName, lastName, photo, name, privateDetails, identity, shareCode, onRelink, onBack, onDone }: AthleteEditScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  const title = t('athletes.edit.title', { name: `${firstName} ${lastName}`.trim() });

  return (
    <View style={{ alignSelf: 'stretch', flex: 1, backgroundColor: colors['surface-0'] }}>
      <ColorHeader color={athleteColor(athleteId)} title={title} onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[12] * 2 }}>
        {photo}
        <View
          style={{
            gap: space[3],
            padding: space[4],
            borderRadius: radius.md,
            backgroundColor: colors['surface-1'],
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors.ink }]}>
            {t('athletes.edit.details')}
          </Text>
          {name}
          {privateDetails}
          {identity}
        </View>
        {shareCode}
        {onRelink ? (
          <View
            testID="relink-entry"
            style={{ gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors.border }}
          >
            <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors.ink }]}>
              {t('athletes.edit.relink_title')}
            </Text>
            <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('athletes.edit.relink_text')}</Text>
            <View style={{ alignItems: 'flex-start' }}>
              <Button variant="secondary" label={t('athletes.edit.relink_action')} onPress={onRelink} />
            </View>
          </View>
        ) : null}
        <Button variant="primary" label={t('athletes.edit.done')} onPress={onDone} />
      </ScrollView>
    </View>
  );
}
