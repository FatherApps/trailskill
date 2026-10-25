# App assets

PNG files that `app.config.ts` references. They are exported from the official SVGs in `design/assets/logos/` without redrawing or recoloring; to change them, change the design system first.

| File | Source | Export |
| --- | --- | --- |
| `icon.png` | `trailskill-play-icon-512.svg` | 1024 × 1024, no alpha |
| `adaptive-icon.png` | `trailskill-adaptive-foreground.svg` | 1024 × 1024, transparent; the background layer is `#141414` in `app.config.ts` |
| `splash-light.png` | `trailskill-lockup-stacked.svg` | 1024 px wide logo centered on a 2304 × 2304 transparent canvas |
| `splash-dark.png` | `trailskill-lockup-reversed.svg` | 1024 px wide logo centered on a 1664 × 1664 transparent canvas |

The splash images are square with transparent margin because Android 12 and later crop the splash image to a circle two thirds of its frame; without the margin the lockup is cut. There is no monochrome layer for themed icons because the design system does not provide one.
