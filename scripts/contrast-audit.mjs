// Contrast audit: every colour pairing the components use, measured in light and dark mode from
// src/styles/tokens.css (WCAG 2 contrast ratio). Floors from DESIGN.md: text 4.5:1, non-text 3:1.
// Exits 1 if any enforced pairing is under its floor. Run: node scripts/contrast-audit.mjs
//
// Keep PAIRINGS in step with the CSS: a new colour use in a component needs a line here.

import { readFileSync } from 'node:fs'

const FLOOR = { text: 4.5, 'non-text': 3 }
// DESIGN.md asks for a margin, not a bare pass: anything under these is flagged (but doesn't fail).
const MARGIN = { text: 5, 'non-text': 3.5 }

// [foreground role, background role, kind, where it is used]
// Background 'ground-texture' is the page. In light mode it is the End stone texture: TEXT there is
// measured against every colour in it (DESIGN.md: the darkest speck, #BDB77F, is the worst case for a
// thin glyph stroke); NON-TEXT (borders, outlines, fills: shapes much larger than a speck) is measured
// against the ground colour itself. 'ground' is that colour painted solid, without the texture
// (top bar, inputs, menu hover).
const PAIRINGS = [
  // Text
  ['text', 'ground-texture', 'text', 'body text, card titles, chips on the page'],
  ['text', 'ground', 'text', 'wordmark in the top bar, input text, menu item on hover'],
  ['text', 'surface', 'text', 'panels, menu, quiet buttons, comment initials, alerts in panels'],
  ['text-secondary', 'ground-texture', 'text', '.muted, card meta, comment times and counts on the page'],
  ['text-secondary', 'surface', 'text', '.muted in panels and the menu, disabled buttons'],
  ['text-secondary', 'ground', 'text', 'comment box placeholder (inputs are painted solid ground)'],
  ['link', 'ground-texture', 'text', 'links and upload percentage on the page'],
  ['link', 'ground', 'text', 'Admin chip in the top bar'],
  ['link', 'surface', 'text', 'links in panels (admin comments)'],
  ['danger-text', 'ground-texture', 'text', 'comment Delete, over-limit count, alerts on the page'],
  ['danger-text', 'surface', 'text', 'danger buttons, alerts in panels'],
  ['on-accent', 'accent-fill', 'text', 'primary button and active tab labels'],
  ['eye-glint', 'avatar-face', 'text', 'player error note'],

  // Icons, graphics and state indicators
  ['ground', 'accent-fill', 'non-text', 'logo play arrow on its block'],
  ['accent-fill', 'ground', 'non-text', 'logo block in the top bar; upload progress fill in its bar'],
  ['accent-fill', 'ground-texture', 'non-text', 'primary button fill against the page'],
  ['accent-fill', 'surface', 'non-text', 'primary button fill in panels; checked checkbox'],
  ['attention', 'avatar-face', 'non-text', 'avatar eyes'],
  ['link', 'ground-texture', 'non-text', 'focus outline on the page'],
  ['link', 'ground', 'non-text', 'focus outline in the top bar'],
  ['link', 'surface', 'non-text', 'focus outline in panels and the menu'],

  // Borders on the surface they sit on
  ['border', 'ground-texture', 'non-text', 'inputs, chips, panels, cards and avatar frames on the page'],
  ['border', 'ground', 'non-text', 'account button in the top bar'],
  ['border', 'surface', 'non-text', 'inputs, quiet buttons and chips inside panels and the menu'],
  ['accent-fill', 'surface', 'non-text', 'account button border while its menu is open (inside)'],
  ['danger-outline', 'ground-texture', 'non-text', 'danger buttons and error alerts on the page'],
  ['danger-outline', 'surface', 'non-text', 'danger buttons and error alerts in panels'],
  ['attention', 'ground-texture', 'non-text', 'attention panel border (something waiting)'],
  ['positive', 'ground-texture', 'non-text', 'success alert border on the page'],
  ['positive', 'surface', 'non-text', 'success alert border in panels'],
]

// Roles with no component using them yet, held to the text floor because DESIGN.md says each always
// comes with its word. Enforced, but left out of "lowest still in use".
const RESERVED = [
  ['positive', 'ground-texture', 'text', 'reserved: green "active" wording'],
  ['positive', 'surface', 'text', 'reserved: green "active" wording'],
  ['warning', 'ground-texture', 'text', 'reserved: amber "muted" wording'],
  ['warning', 'surface', 'text', 'reserved: amber "muted" wording'],
]

// Measured for information only: decoration that identifies no control or state (WCAG 1.4.11).
const DECORATIVE = [
  ['divider', 'surface', 'separators between list items and menu sections'],
  ['divider', 'ground', 'top bar bottom edge'],
  ['surface-bevel', 'surface', 'quiet button bevel'],
  ['accent-bevel', 'accent-fill', 'primary button bevel; progress bar stripe'],
  ['particle-1', 'banner', 'banner particles (decoration only, never under text)'],
]

// ---- tokens.css ----

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1]

// Split declarations on ; outside brackets (the texture spans several lines with commas and brackets).
const decls = []
let depth = 0
let current = ''
for (const ch of root) {
  if (ch === '(') depth++
  if (ch === ')') depth--
  if (ch === ';' && depth === 0) {
    decls.push(current.trim())
    current = ''
  } else current += ch
}

const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
const dark = {}
const tokens = {} // name -> { light: [hex...], dark: [hex...] }
for (const decl of decls) {
  const m = decl.match(/^--([a-z0-9-]+)\s*:\s*([\s\S]+)$/)
  if (!m) continue
  const [, name, value] = m
  const darkValue = value.match(/^var\(--is-dark\)\s+([\s\S]+)$/)
  if (name.startsWith('dark-') && darkValue) dark[name.slice(5)] = darkValue[1].match(HEX)
}
for (const decl of decls) {
  const m = decl.match(/^--([a-z0-9-]+)\s*:\s*([\s\S]+)$/)
  if (!m || m[1].startsWith('dark-')) continue
  const [, name, value] = m
  const paired = value.match(/^var\(\s*--dark-([a-z0-9-]+)\s*,([\s\S]+)\)$/)
  if (paired) {
    if (paired[1] !== name || !dark[name]) throw new Error(`tokens.css: --${name} has no matching --dark-${name}`)
    tokens[name] = { light: paired[2].match(HEX), dark: dark[name] }
  } else {
    const hexes = value.match(HEX)
    if (hexes) tokens[name] = { light: hexes, dark: hexes }
  }
}

// Only the texture is several colours (its specks, then the ground colour last); any other token is one.
function colours(role, mode, kind) {
  const token = tokens[role]
  if (!token) throw new Error(`tokens.css has no colour token --${role}`)
  return role === 'ground-texture' && kind === 'text' ? token[mode] : [token[mode].at(-1)]
}

// ---- WCAG 2 contrast ----

function luminance(hex) {
  const h = hex.length === 4 ? hex.replace(/\w/g, (c) => c + c) : hex
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// The worst case over every colour each side can be.
function measure(fg, bg, mode, kind) {
  let worst = null
  for (const f of colours(fg, mode, kind)) {
    for (const b of colours(bg, mode, kind)) {
      const r = ratio(f, b)
      if (!worst || r < worst.ratio) worst = { ratio: r, fgHex: f.toUpperCase(), bgHex: b.toUpperCase() }
    }
  }
  return worst
}

// ---- report ----

const results = []
for (const mode of ['light', 'dark']) {
  for (const [list, group] of [
    [PAIRINGS, 'in use'],
    [RESERVED, 'reserved'],
  ]) {
    for (const [fg, bg, kind, where] of list) results.push({ mode, group, fg, bg, kind, where, ...measure(fg, bg, mode, kind) })
  }
}

const pad = (s, n) => String(s).padEnd(n)
const fmt = (r) => `${r.toFixed(2).padStart(5)}:1`
const pair = (r) => `${pad(r.fg, 14)} ${pad(r.fgHex, 7)} on ${pad(r.bg, 14)} ${pad(r.bgHex, 7)}`

let failures = 0
for (const mode of ['light', 'dark']) {
  console.log(`\n${mode.toUpperCase()} MODE   (floor: text ${FLOOR.text}, non-text ${FLOOR['non-text']}; "thin" = under ${MARGIN.text} / ${MARGIN['non-text']})`)
  for (const r of results.filter((x) => x.mode === mode)) {
    const fail = r.ratio < FLOOR[r.kind]
    if (fail) failures++
    const status = fail ? 'FAIL' : r.ratio < MARGIN[r.kind] ? 'thin' : 'ok'
    const label = r.group === 'reserved' ? `[not used yet] ${r.where}` : r.where
    console.log(`  ${pad(status, 4)} ${fmt(r.ratio)}  ${pad(r.kind, 8)} ${pair(r)}  ${label}`)
  }
  console.log('  decorative, not enforced:')
  for (const [fg, bg, where] of DECORATIVE) {
    const m = measure(fg, bg, mode, 'non-text')
    console.log(`       ${fmt(m.ratio)}  ${pad('', 8)} ${pair({ fg, bg, ...m })}  ${where}`)
  }
}

console.log('\nLowest still in use:')
for (const kind of ['text', 'non-text']) {
  const lowest = results.filter((r) => r.group === 'in use' && r.kind === kind).sort((a, b) => a.ratio - b.ratio)[0]
  console.log(`  ${pad(kind, 8)} ${fmt(lowest.ratio)}  ${lowest.mode} mode, ${pair(lowest)}  ${lowest.where}`)
}

if (failures) {
  console.log(`\n${failures} pairing${failures === 1 ? '' : 's'} under the floor.`)
  process.exit(1)
}
console.log('\nEvery pairing meets its floor.')
