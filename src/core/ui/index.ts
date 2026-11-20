import type { GalleryEntry } from './gallery';

export { useFocusRing } from './focusRing';
export { useHardwareBack } from './useHardwareBack';
export { Button, type ButtonProps, type ButtonVariant } from './Button';
export { TextField, type TextFieldProps } from './TextField';
export { Tag, type TagProps, type TagVariant } from './Tag';
export { StepHeader, stepHeaderColors, type StepHeaderProps } from './StepHeader';
export { StateView, stateViewColors, type StateKind, type StateViewProps } from './StateView';
export { SyncStatus, syncStatusColors, type SyncStatusProps } from './SyncStatus';
export { ConfirmSheet, confirmSheetColors, type ConfirmSheetProps } from './ConfirmSheet';
export { Banner, bannerColors, type BannerProps, type BannerVariant } from './Banner';
export { Icon, type IconProps } from './Icon';
export { StrokeIcon, type StrokeIconProps } from './StrokeIcon';
export { IconButton, iconButtonColors, type IconButtonProps } from './IconButton';
export { Logo, LogoSymbol, type LogoProps, type LogoSymbolProps } from './Logo';
export { iconPaths, type IconName } from './icons';
export { Segmented, segmentedColors, type SegmentedOption, type SegmentedProps } from './Segmented';
export { TimeValue, type TimeValueProps } from './TimeValue';
export {
  AthleteAvatar,
  athleteAvatarColors,
  type AthleteAvatarProps,
  type AthleteAvatarRenderer,
  type AthleteAvatarSize,
  type AthleteAvatarSlot,
  type AthleteAvatarSlotProps,
} from './AthleteAvatar';
export { SwimmerRow, swimmerRowColors, type SwimmerRowProps } from './SwimmerRow';
export { NavBar, navBarColors, type NavBarItem, type NavBarProps } from './NavBar';
export { ColorCard, colorCardColors, type ColorCardColor, type ColorCardDecoration, type ColorCardProps } from './ColorCard';
export { ColorHeader, colorHeaderColors, type ColorHeaderProps } from './ColorHeader';
export { Chip, InitialsDot, chipColors, type ChipProps, type InitialsDotProps } from './Chip';
export { ChipRow, type ChipRowOption, type ChipRowProps } from './ChipRow';
export type { GalleryEntry } from './gallery';
// Dev only: Metro drops this require from release bundles (issue 1040).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import would bundle the gallery in release builds
export const galleryEntries: GalleryEntry[] = __DEV__ ? (require('./gallery') as typeof import('./gallery')).galleryEntries : [];
