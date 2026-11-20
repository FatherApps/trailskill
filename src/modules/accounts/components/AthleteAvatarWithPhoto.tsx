import { AthleteAvatar, type AthleteAvatarSlotProps } from '../../../core/ui';
import { useAthletePhoto } from '../../athletes';
import { useHasValidAuthorization } from '../data/authorizations';

// The athlete's avatar with their photo. It lives here because accounts owns show_photo and already depends on athletes, which owns the photo
// (athletes cannot read the authorization without a cycle). Modules that depend on both import it; athletes receives it from its route.
export function AthleteAvatarWithPhoto({ athleteId, initials, color, size }: AthleteAvatarSlotProps) {
  const authorized = useHasValidAuthorization(athleteId, 'show_photo');
  const photo = useAthletePhoto(athleteId, authorized);
  return <AthleteAvatar initials={initials} colorIndex={color && (Number(color.slice(-1)) as 1 | 2 | 3 | 4)} size={size} photoUri={photo.uri ?? undefined} authorized={authorized} />;
}
