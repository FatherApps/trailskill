import { Share } from 'react-native';

import { t } from '../../../core/i18n';
import { ShareCodeChip } from '../components/ShareCodeChip';
import type { ShareCodeCache } from '../data/athleteShareCodeCache';
import type { AthleteShareCodeRepository } from '../data/athleteShareCodes';
import { useAthleteShareCode } from '../data/useAthleteShareCode';

export type AthleteShareCodeChipContainerProps = {
  athleteId: string;
  repository: AthleteShareCodeRepository;
  cache: ShareCodeCache;
  userId: string | undefined;
  online: boolean;
  // Injected by tests; otherwise the system share sheet, which also copies.
  share?: (message: string) => Promise<unknown>;
};

const defaultShare = (message: string) => Share.share({ message });

// The share code of a swimmer on their card: the last known one without signal, refreshed with signal. No code known, or refused by the server: nothing shows.
export function AthleteShareCodeChipContainer({ athleteId, repository, cache, userId, online, share = defaultShare }: AthleteShareCodeChipContainerProps) {
  const { state } = useAthleteShareCode({ repository, cache, userId, athleteId, online });
  if (state.status !== 'ready') return null;
  return <ShareCodeChip code={state.code} onShare={() => share(t('accounts.share_code.share_message', { code: state.code })).catch(() => {})} />;
}
