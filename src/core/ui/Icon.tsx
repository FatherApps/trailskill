import Svg, { Path } from 'react-native-svg';

import { useTheme, type ColorToken } from '../theme';
import { iconPaths, type IconName } from './icons';

export type IconProps = {
  name: IconName;
  size?: 'icon-md' | 'icon-sm';
  color?: ColorToken;
  /** Only for icons that carry meaning on their own; without it the icon is decorative and hidden from screen readers. */
  accessibilityLabel?: string;
};

export function Icon({ name, size: sizeToken = 'icon-md', color = 'ink', accessibilityLabel }: IconProps) {
  const { colors, size } = useTheme();
  const px = size[sizeToken];

  return (
    <Svg
      width={px}
      height={px}
      viewBox="0 -960 960 960"
      {...(accessibilityLabel
        ? { accessible: true, accessibilityRole: 'image', accessibilityLabel }
        : {
            accessible: false,
            importantForAccessibility: 'no-hide-descendants',
            accessibilityElementsHidden: true,
          })}
    >
      <Path d={iconPaths[name]} fill={colors[color]} />
    </Svg>
  );
}
