// Third-party brand marks. Their brand guidelines require them unmodified, so these are the official
// colors of each provider, not TrailSkill colors: this is the only file of the module allowed to hold color literals.
//
// Microsoft: the four-square mark, copied from the official SVG (ms-symbollockup_mssymbol_19.svg) of
// https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps
//
// Google: the standard color "G" is an angular gradient with blur that plain SVG paths cannot reproduce without
// changing it, so the official PNG is bundled as is (google-g.png, 200x204, from the Google Identity branding
// guidelines page, https://developers.google.com/identity/branding-guidelines, file /static/identity/images/g-logo.png;
// the same G is inside the guidelines' signin-assets.zip). Google asks for it on a white background.
import type { ImageSourcePropType } from 'react-native';

// require, not import: the project has no module declaration for image files.
export const googleMark: { source: ImageSourcePropType } = { source: require('./google-g.png') };

export const microsoftMark = {
  viewBox: '0 0 21 21',
  squares: [
    { x: 1, y: 1, fill: '#f25022' },
    { x: 1, y: 11, fill: '#00a4ef' },
    { x: 11, y: 1, fill: '#7fba00' },
    { x: 11, y: 11, fill: '#ffb900' },
  ],
  squareSize: 9,
} as const;
