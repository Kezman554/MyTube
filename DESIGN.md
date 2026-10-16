# MyTube — Design

Status: provisional. Values hold until judged on real family phones and laptops.
Canvas: https://claude.ai/artifact/Xy4UU9XrhpfarQgpaU4YKx (direction F, chosen by the creator, 16 Oct 2026)

## Purpose and conditions of use
- Display: arbitrary (viewers' own phones, tablets and laptops), so build with margin rather than tuning. The creator uploads from a computer.
- Use: a phone or laptop in hand, on a sofa or at a desk, with attention on the video
- Looked at most: the video grid on the channel page; on the watch page, the player
- Modes: light and dark, following the device setting (`prefers-color-scheme`); no in-app choice

## Direction
The creator's own channel identity, CrAzYeNdErMaN, as the look: the Enderman's End. Near-black and Ender purple in dark mode; pale End stone in light mode. YouTube's structure (channel page, grid, watch page) in a look of its own. Drawn from scratch: no Minecraft logos, textures or other game assets.

## Typefaces (bundled locally with `@fontsource`, never fetched)
- **Press Start 2P** (400 only): the wordmark, the channel name, headings, buttons, tabs, chips and video lengths. Never below 9px.
- **Rubik** 400/500/600: video titles, descriptions, comments, metadata, form fields, table cells.
- The channel name is always written **CrAzYeNdErMaN**, in alternating capitals.

## Tokens

| Role | Dark | Light |
|---|---|---|
| ground | `#0E0A14` | `#EDEBC4` + End stone texture |
| surface (cards, inputs, inactive buttons) | `#1A1424` | `#F7F5DC` |
| border | `#3B2A52` | `#BDB585` |
| divider | `#2A1F3B` | `#CFC99A` |
| text | `#F1E9FF` | `#1E1530` |
| text-secondary | `#B5A6CC` | `#5B4D70` |
| accent-fill / on-accent | `#B45CFF` / `#0E0A14` | `#7A2FC2` / `#FFFFFF` |
| accent-bevel (inset shadow on a filled button) | `#7A2FC2` | `#4E1A85` |
| surface-bevel | `#120D1A` | `#D6D09E` |
| link | `#C98BFF` | `#6A24AD` |
| attention (pending, counts, the eyes) | `#E070FF` | `#E070FF` |
| positive (active) | `#7ED98A` | `#2E7D3E` *(not drawn on canvas)* |
| warning (muted) | `#FFB86B` | `#9A5B00` *(not drawn on canvas)* |
| danger outline / danger text | `#FF7A9C` / `#FF9CB5` | `#B3264A` / `#B3264A` *(not drawn on canvas)* |
| banner and avatar face (both modes) | `#1C1230`, `#050308` | same |

The End stone texture is pure CSS: layered `conic-gradient` squares at prime-number tile sizes over the ground, in `#DAD6A3`, `#CFCA94`, `#DFDBAA`, `#BDB77F`, `#C6C08A` and `#F6F4D6`. The source is on the canvas's light-mode boards.

## Geometry: prohibitions
- Never a border radius. Every corner is square.
- Never a soft or blurred shadow. Depth is a 3px inset bevel on the bottom-right of a button, and nothing else.
- Never a gradient, except the End stone texture and the progress bar's block segments.
- Never a border thinner or thicker than 2px.
- Icons are pixel art on an 8×8 grid with `shape-rendering="crispEdges"`. Never emoji, never a smooth icon set.

## What colour means
- Purple fill = the primary action, or the active tab. One per group.
- Magenta (`attention`) = something is waiting: a pending user, a draft count. It is also the Enderman's eyes.
- Green = active, amber = muted. Each always comes with its word.
- Destructive actions (Remove, Turn away, Reject) are a danger outline plus explicit wording, never colour alone.
- **Deliberate exceptions, don't "fix" them:** the banner and the avatar's black face stay dark in light mode, and the purple particles are decoration only. Particles never sit under body text.

## Contrast
- Text 4.5:1 and non-text 3:1 in both modes, with a margin, not a bare pass. Measured by script, never by eye. The canvas values have not been measured yet.
- No coloured text on translucent tints. Text on the End stone texture is checked against its darkest speck, `#BDB77F`.

## Enforcement
- No colour, font-family or radius literal outside `src/styles/tokens.css`. Check: `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|font-family|border-radius" src | grep -v "src/styles/tokens.css"` returns nothing.
- Tokens are CSS custom properties, switched by `@media (prefers-color-scheme: dark)`. Components reference roles, never values.

## Icon
One source drawing, the Enderman face (black square, magenta eyes) on the 8×8 grid, generates every icon: the favicon (SVG and PNG), the apple-touch icon and any manifest icons. Built on its own card, and checked in a real browser tab and on a bookmarks bar. A 200 response proves nothing, because the SPA catch-all returns `index.html`, so check the content type.

## Not settled here
This file does not settle the palette. Rendering on real devices does: family phones in both modes, and a laptop.
