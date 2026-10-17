// Generates the PNG icons in public/ from public/icon.svg. Run with `npm run icons`; the PNGs are
// committed, so the normal build does not need this.
// Every size is the 16x16 drawing scaled with nearest-neighbour, so the pixels stay sharp. All are
// transparent except the apple-touch icon, which gets the dark ground colour from tokens.css (iOS
// would otherwise fill it black). 180 is not a multiple of 16, so that icon is drawn at 11x (176 px)
// and padded 2 px each side, which keeps every pixel the same size.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = new URL('../', import.meta.url)
const path = (p) => fileURLToPath(new URL(p, root))

// --ground inside the prefers-color-scheme: dark block of tokens.css.
function darkGround() {
  const css = readFileSync(path('src/styles/tokens.css'), 'utf8')
  const dark = css.slice(css.indexOf('prefers-color-scheme: dark'))
  const match = dark.match(/--ground:\s*(#[0-9a-fA-F]{6})\s*;/)
  if (!match) throw new Error('Could not find --ground in the dark block of tokens.css')
  return match[1]
}

// The drawing at 1 px per grid cell: exact pixels, no anti-aliasing.
const source = await sharp(path('public/icon.svg')).resize(16, 16).png().toBuffer()
const scaled = (size) => sharp(source).resize(size, size, { kernel: 'nearest' })

const jobs = [
  ['favicon-32.png', scaled(32)],
  ['icon-192.png', scaled(192)],
  ['icon-512.png', scaled(512)],
  [
    'apple-touch-icon.png',
    sharp(await scaled(176).png().toBuffer()).extend({ top: 2, bottom: 2, left: 2, right: 2, background: darkGround() }).flatten({ background: darkGround() }),
  ],
]

for (const [name, image] of jobs) {
  const info = await image.png().toFile(path(`public/${name}`))
  console.log(`public/${name} ${info.width}x${info.height}`)
}
