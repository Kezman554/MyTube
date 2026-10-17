# MyTube — Design

Status: provisional. Values hold until judged on real family phones and laptops.
Canvas: https://claude.ai/artifact/Xy4UU9XrhpfarQgpaU4YKx (direction F, chosen by the creator, 16 Oct 2026)

## Purpose and conditions of use
- Display: arbitrary (viewers' own phones, tablets and laptops), so build with margin rather than tuning. The creator uploads from a computer.
- Use: a phone or laptop in hand, on a sofa or at a desk, with attention on the video
- Looked at most: the video grid on the channel page; on the watch page, the player
- Modes: light and dark. Until someone chooses, the site follows the device setting (`prefers-color-scheme`), live. Anyone signed in can switch with the **light/dark toggle** in the account menu: it shows the mode you're in and switches to the other. The choice is a device preference, not an account setting: it is kept in that browser's localStorage only (never on the server), outlives signing out, and from then on wins over the device setting on that device.

## Direction
The creator's own channel identity, CrAzYeNdErMaN, as the look: the Enderman's End. Near-black and Ender purple in dark mode; pale End stone in light mode. YouTube's structure (channel page, grid, watch page) in a look of its own. Drawn from scratch: no Minecraft logos, textures or other game assets.

## Typefaces (bundled locally with `@fontsource`, never fetched)
- **Press Start 2P** (400 only): the wordmark, the channel name, headings, buttons, tabs, chips and video lengths. Never below 9px.
- **Rubik** 400/500/600: video titles, descriptions, comments, metadata, form fields, table cells.
- The channel name is always written **CrAzYeNdErMaN**, in alternating capitals.

## Tokens

Light is the base. Dark applies in exactly two cases: the device prefers dark and nobody has chosen on this device (`@media (prefers-color-scheme: dark)` on `:root:not([data-theme="light"])`), or `data-theme="dark"` is set on `<html>`, whatever the device says. A choice sets `data-theme="light"` or `"dark"` on `<html>`; an inline script in `index.html` sets it from localStorage before the first paint, so a page never flashes the other mode. Every localStorage read and write is wrapped so blocked storage still renders the site (the toggle then lasts for that page only).

There is one set of dark values. In `tokens.css` each colour that changes is written once per mode, side by side (`--dark-ground: var(--is-dark) #0E0A14;` then `--ground: var(--dark-ground, #EDEBC4);`), and the two cases above only flip the `--is-dark` switch. `tests/tokens.test.ts` checks the pairs are complete.

| Role | Dark | Light |
|---|---|---|
| ground | `#0E0A14` | `#EDEBC4` + End stone texture |
| surface (cards, inputs, inactive buttons) | `#1A1424` | `#F7F5DC` |
| border | `#3B2A52` | `#BDB585` |
| divider | `#2A1F3B` | `#CFC99A` |
| text | `#F1E9FF` | `#1E1530` |
| text-secondary | `#B5A6CC` | `#443A54` |
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
- No colour, font or radius literal value outside `src/styles/tokens.css`: hex, `rgb()`/`hsl()`, a quoted font name in `font`/`font-family`, or a `font-family`/`border-radius` value that is not `var(--…)`. Property names are fine; `var(--…)` is fine everywhere, including React inline styles (`fontFamily`, `borderRadius`). Check: `grep -rnE "#[0-9a-fA-F]{3,8}\b|(rgb|hsl)a?\(|\bfont(-family|Family)?[[:space:]]*:[^;'\"]*['\"]([^v]|v[^a]|va[^r]|var[^(])|(font-family|border-radius)[[:space:]]*:[[:space:]]*([^v[:space:]]|v[^a]|va[^r]|var[^(])|borderRadius[[:space:]]*:[[:space:]]*(['\"]([^v]|v[^a]|va[^r]|var[^(])|[0-9])" src | grep -v "src/styles/tokens.css"` returns nothing.
- Tokens are CSS custom properties, switched as described under Tokens: the device setting until a choice is made, then `data-theme` on `<html>`. Nothing outside `tokens.css` tests the mode (no `prefers-color-scheme` or `data-theme` in component CSS). Components reference roles, never values.

## Icon
**A pixel slice of pizza with dripping cheese, on no background** (the creator's pick, icon round 2, 16 Oct 2026). One source drawing, `public/icon.svg`, generates every icon (`npm run icons` writes the PNGs to `public/`): the favicon (SVG and PNG), the apple-touch icon and any manifest icons. A 200 response proves nothing, because the SPA catch-all returns `index.html`, so check the content type.

16×16 grid, `shape-rendering="crispEdges"`, transparent background. Each rect is x, y, width, height:
- Crust: dark `#8A4F1C` 2,1,12,1 · crust `#B5712E` 1,2,14,2 · highlight `#D9964A` 2,2,11,1
- Cheese `#F5C542`: 2,4,12,1 · 3,5,10,2 · 4,7,8,1 · 5,8,6,2 · 6,10,4,1 · 7,11,2,2
- Cheese shade `#E0A92E` (right edge): 12,5,1,2 · 11,7,1,1 · 10,8,1,2 · 9,10,1,1 · 8,11,1,2
- Pepperoni `#C2352B`: 4,5,2,2 · 9,5,2,1 · 9,6,1,1 · 6,8,2,1 · 7,9,1,1
- Drips `#F5C542`: 3,7,1,3 · 12,7,1,2 · 5,10,1,2 · 7,13,1,2. Drip tips `#E0A92E`: 3,10,1,1 · 7,15,1,1

The icon colours live only in `public/icon.svg`; they are not UI tokens. The creator's channel logo (an Enderman eating dripping pizza) is a separate, later piece of work and out of scope here.

## Not settled here
This file does not settle the palette. Rendering on real devices does: family phones in both modes, and a laptop.
