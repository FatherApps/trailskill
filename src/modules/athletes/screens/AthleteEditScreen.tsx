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
  // The sections of other modules, passed by the route (athletes cannot import accounts: a cycle). Order on screen: photo, data (identity inside it), health, share code.
  photo?: ReactNode;
  // The identity document, inside "Datos del nadador" (a later issue fills it).
  identity?: ReactNode;
  // "Salud y emergencias": reserved and empty today.
  health?: ReactNode;
  shareCode?: ReactNode;
  onBack: () => void;
  onDone: () => void;
};

// Presentational: no network, database or repository. Only who manages the swimmer reaches it (the route decides).
export function AthleteEditScreen({ athleteId, firstName, lastName, photo, identity, health, shareCode, onBack, onDone }: AthleteEditScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  const title = t('athletes.edit.title', { name: `${firstName} ${lastName}`.trim() });
  const field = (label: string, value: string) => (
    <View style={{ gap: space[1] }}>
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{label}</Text>
      <Text style={[typography.body, { color: colors.ink }]}>{value}</Text>
    </View>
  );

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
          {field(t('athletes.edit.first_name'), firstName)}
          {field(t('athletes.edit.last_name'), lastName)}
          <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('athletes.edit.name_locked')}</Text>
          {identity}
        </View>
        {health}
        {shareCode}
        <Button variant="primary" label={t('athletes.edit.done')} onPress={onDone} />
      </ScrollView>
    </View>
  );
}
