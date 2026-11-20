# App assets

PNG files that `app.config.ts` references. They are exported from the official SVGs in `design/assets/logos/` without redrawing or recoloring; to change them, change the design system first.

| File | Source | Export |
| --- | --- | --- |
| `icon.png` | `swimcro-play-icon-512.svg` | 1024 × 1024, no alpha |
| `adaptive-icon.png` | `swimcro-adaptive-foreground.svg` | 1024 × 1024, transparent; the background layer is `#141414` in `app.config.ts` |
| `splash-light.png` | `swimcro-lockup-stacked.svg` | 1024 px wide logo centered on a 2304 × 2304 transparent canvas |
| `splash-dark.png` | `swimcro-lockup-reversed.svg` | 1024 px wide logo centered on a 1664 × 1664 transparent canvas |
| `adaptive-icon-monochrome.png` | `swimcro-symbol-mono.svg` | 1024 × 1024, transparent; the symbol is 569 px, centered; Android tints it for themed icons |

The splash images are square with transparent margin because Android 12 and later crop the splash image to a circle two thirds of its frame; without the margin the lockup is cut. The themed icon of Android 13 and later (`adaptive-icon-monochrome.png`) is `swimcro-symbol-mono.svg` at 569 px (the adaptive foreground scale, 240 of 432) centered on a 1024 × 1024 transparent canvas; Android tints its alpha.
