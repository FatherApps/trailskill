import { AthleteAvatar, type AthleteAvatarRenderer, type AthleteAvatarSlot, type AthleteAvatarSlotProps } from '../../../core/ui';

type Who = { initials: string; color: AthleteAvatarSlotProps['color'] };

// The avatar of one athlete of a school list, with their photo when show_photo is in force. `Avatar` is injected by the route (school-console
// cannot read the photo or the authorization itself); without it the rows show the initials. Presentational rows ask for the size they need.
export function avatarOf(Avatar: AthleteAvatarSlot | undefined, athlete: Who & { id: string }): AthleteAvatarRenderer | undefined {
  if (!Avatar) return undefined;
  return function avatarOfSize(size) {
    return <Avatar athleteId={athlete.id} initials={athlete.initials} color={athlete.color} size={size} />;
  };
}

// The initials-only avatar a row draws when its caller gave none (the gallery, a screen without a route that injects the photo).
export function initialsAvatar(athlete: Who, size: AthleteAvatarSlotProps['size']) {
  return <AthleteAvatar initials={athlete.initials} colorIndex={athlete.color && (Number(athlete.color.slice(-1)) as 1 | 2 | 3 | 4)} size={size} authorized={false} />;
}
