# TrailSkill design reference

The single source of truth for TrailSkill's visual design is the **TrailSkill design system** in Claude Design:

**https://claude.ai/artifact/SoMStMt7XvkqiqkkgJoitf**

It defines the palette, typography, shapes, spacing, iconography, components, reference screens, content voice, view states, and accessibility rules. Read its README and sections before any UI work.

## Rules

- Do not change colors, fonts, type scale, radii, spacing, iconography, or the logo in code, docs, or assets. A design change is made first in the design system by the maintainer, then reflected in the app through an issue that links the design-system change.
- Never use a color, font, or size that is not in the design system. If something is missing, open an issue labeled `needs-decision`; do not invent a value.
- Use the logo files in [`assets/logos/`](assets/logos/) as they are. Do not redraw, recolor, stretch, rotate, or retype the wordmark.
- This folder holds only the reference and the official logo files. No design-system code (CSS, tokens, components) is copied into the repository; the app implements the design from the source.
- The design system is private in Claude. The maintainer shares it with each collaborator who needs to read it.

## Snapshot (2026-10-24)

For orientation only. If it disagrees with the design system, the design system wins.

| Topic | Value |
| --- | --- |
| Main action | Lime `#C8EF55` pill, one per screen |
| Brand colors | Coral `#FF5E45`, lilac `#B8A6F8`, sky `#4CC3F0` |
| Ink and dark surfaces | Near-black `#141414` |
| Canvas | Warm off-white `#F4F2EC` (light theme, the default); dark theme follows the OS |
| Athlete colors | One per athlete, in order: lilac, coral, sky, lime; always shown with the name |
| Typography | Bricolage Grotesque ExtraBold for display, IBM Plex Sans for UI text, IBM Plex Mono for every time value |
| Shapes | Radius 12 / 24 / 32; buttons, chips, tags, and navigation are pills |
| Icons | Material Symbols Outlined, weight 400 |

## Logo files

| File | Use |
| --- | --- |
| `trailskill-lockup.svg` | Default on the light canvas, white, and lime |
| `trailskill-lockup-reversed.svg` | On near-black and in dark theme |
| `trailskill-lockup-stacked.svg` | Splash, store graphics, presentations |
| `trailskill-wordmark.svg` | Where the symbol is already nearby |
| `trailskill-symbol.svg` | App avatar and small spaces above 24 px |
| `trailskill-symbol-reversed.svg` | Symbol on near-black or dark backgrounds |
| `trailskill-symbol-small.svg` | 24 px and below (favicon, notifications) |
| `trailskill-symbol-mono.svg` | Single ink, one-color print |
| `trailskill-play-icon-512.svg` / `.png` | Google Play icon |
| `trailskill-adaptive-foreground.svg` / `.png` | Android adaptive icon foreground on a `#141414` background layer |
| `trailskill-construction.svg` | Construction grid (reference, not for use in the app) |

The files were downloaded from the design system on 2026-10-24. The PNG files are byte-identical to the source. The design system's asset service re-serializes SVG markup when it serves it, so the SVG files draw the same image but are not byte-identical to the uploads.

## Pending updates in the design system

Product discovery on 2026-10-24 found differences that must be resolved in the design system before the related screens are built:

- **Series timing:** the design uses one Stop button per lane. The maintainer described one button that records arrival positions, followed by fast name-card assignment.
- **School console:** listed as an open decision; it was decided to be the same Expo app on tablets.
- **Training plans:** described by the maintainer (repetitions × distance × stroke × equipment) but not designed yet.
