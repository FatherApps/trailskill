# Swimcro design reference

The single source of truth for Swimcro's visual design is the **Swimcro design system** in Claude Design:

**https://claude.ai/artifact/SoMStMt7XvkqiqkkgJoitf**

Screen mockups «TrailSkill — mockups (dirección lima)», a reference for the screens (not the source of truth):

**https://claude.ai/artifact/MH2dwQ2tgTFo2LTh44mY5R**

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

## Additions accepted after the snapshot

Accepted by the maintainer on 2026-11-24 (decision a21 in #1464) and implemented in `SettingsSwitchRow` and `src/core/ui/icons.ts`. The maintainer adds them to the design system artifact (tracked in #1478); until then this section is the record, and the artifact wins if the two ever disagree.

### Switch (settings row)

The official pattern for a yes/no setting: one card with an iPhone-style switch. Reference implementation: `SettingsSwitchRow` (`src/modules/settings/components/SettingsSwitchRow.tsx`).

- Layout: icon on the left, name and explanation in the middle, switch on the right.
- Whole-card tap: the whole card is the control, not only the switch. It is one `Pressable`; a tap anywhere on it toggles the value.
- Accessibility: role `switch`, `checked` state, the name as the label and the explanation as the hint. The state is also told by the thumb's side, not by color alone. Keyboard focus shows the standard focus ring.
- Card: background `surface-1`, 1.5 px border `border`, radius `md` (24), padding `space-4` (18), gap `space-3` (12), minimum height `target-min` (48). Pressed: the card darkens 4%.
- Icon: 40 px circle (`avatar-md`) on `surface-2`, default Material Symbols Outlined icon. Name in `body-strong` and explanation in `caption`, colors `ink` and `ink-muted`.
- Switch: 28 px thumb (`avatar-sm`), 4 px padding (`space-1`), 1.5 px border, pill radius; overall about 67 x 39 px.
- On: track and border `primary`, thumb `on-primary`, thumb at the right.
- Off: track `surface-2`, border `border-strong` so the control keeps a 3:1 contrast against the card, thumb `surface-1`, thumb at the left.
- Disabled: the component has no disabled state yet, so the design system does not define one. A disabled setting needs a decision from the maintainer (`needs-decision`) before it is built.

### Icons

Material Symbols Outlined, weight 400, as for every other icon.

| Icon | Use |
| --- | --- |
| `notifications` | Do Not Disturb while recording video (Configuración de video) |
| `vibration` | Vibrate when a button marks (Cronómetro avanzado) |
| `headphones` | External buttons and headset (Cronómetro avanzado) |
| `all_inclusive` | Free laps (Cronómetro avanzado) |

## Logo files

| File | Use |
| --- | --- |
| `swimcro-lockup.svg` | Default on the light canvas, white, and lime |
| `swimcro-lockup-reversed.svg` | On near-black and in dark theme |
| `swimcro-lockup-stacked.svg` | Splash, store graphics, presentations |
| `swimcro-wordmark.svg` | Where the symbol is already nearby |
| `swimcro-symbol.svg` | App avatar and small spaces above 24 px |
| `swimcro-symbol-reversed.svg` | Symbol on near-black or dark backgrounds |
| `swimcro-symbol-small.svg` | 24 px and below (favicon, notifications) |
| `swimcro-symbol-mono.svg` | Single ink: one-color print and the Android themed (monochrome) icon |
| `swimcro-play-icon-512.svg` / `.png` | Google Play icon |
| `swimcro-adaptive-foreground.svg` / `.png` | Android adaptive icon foreground on a `#141414` background layer |
| `swimcro-construction.svg` | Construction grid (reference, not for use in the app) |

The files come from the Logos group of the Swimcro design system (the «Superficie con tu logo» version the maintainer chose), downloaded on 2026-11-19 and copied unmodified. They are byte-identical to the downloaded files (`shasum -a 256`); the provisional set from an earlier `swimcro-logos.zip` is not used.
