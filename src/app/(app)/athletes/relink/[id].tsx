import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { t } from '../../../../core/i18n';
import { useGoBack } from '../../../../core/navigation';
import { useSession } from '../../../../core/session';
import { useGlobalSyncSummary } from '../../../../core/sync';
import { useTheme } from '../../../../core/theme';
import { BackButton, StateView } from '../../../../core/ui';
import { createPowerSyncManagedAthleteRepository } from '../../../../modules/accounts';
import {
  athleteDisplay,
  createPowerSyncSchoolAthleteRepository,
  createSupabaseAthleteRelinkRepository,
  RelinkRequestContainer,
  useManagedAthletes,
} from '../../../../modules/athletes';

const athletes = createPowerSyncSchoolAthleteRepository();
const managedAthletes = createPowerSyncManagedAthleteRepository();
const relink = createSupabaseAthleteRelinkRepository();

// "Recuperar tiempos de la escuela": the family types the key of the erased swimmer and the school decides. Only for who manages the swimmer; the server checks it again.
export default function AthleteRelinkRoute() {
  const { space, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useGoBack('/athletes');
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  const managed = useManagedAthletes(managedAthletes, athletes, session?.user.id, summary.lastSyncedAt?.getTime());
  const athlete = managed.status === 'ready' ? managed.athletes.find((candidate) => candidate.id === id) : undefined;

  if (!session) return null;
  if (!athlete) {
    return (
      <View style={{ flex: 1, alignSelf: 'stretch', padding: space[4], gap: space[4], backgroundColor: colors['surface-0'] }}>
        <View style={{ flexDirection: 'row' }}>
          <BackButton onPress={goBack} />
        </View>
        {managed.status === 'loading' ? (
          <StateView kind="loading" />
        ) : (
          <StateView kind="empty" icon="group" title={t('athletes.edit.not_found.title')} message={t('athletes.edit.not_found.message')} />
        )}
      </View>
    );
  }
  return <RelinkRequestContainer key={id} athleteId={id} athleteName={athleteDisplay(athlete).shortName} repository={relink} onBack={goBack} />;
}
