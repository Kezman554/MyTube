import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// tokens.css writes each dark value once (--dark-x: var(--is-dark) …) beside its token
// (--x: var(--dark-x, light)). These checks keep the pairs complete, so the two modes can't drift.
const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const darkDefs = [...css.matchAll(/--dark-([a-z-]+):\s*var\(--is-dark\)/g)].map((m) => m[1])
const tokenUses = [...css.matchAll(/--([a-z-]+):\s*var\(\s*--dark-([a-z-]+)\s*,/g)]

describe('tokens.css', () => {
  it('pairs every dark value with the token of the same name, once each', () => {
    expect(darkDefs.length).toBeGreaterThan(10)
    expect(new Set(darkDefs).size).toBe(darkDefs.length)
    expect(tokenUses.map((m) => m[1]).sort()).toEqual([...darkDefs].sort())
    for (const [, token, dark] of tokenUses) expect(dark).toBe(token)
  })

  it('switches dark mode on in exactly two places: the device rule and data-theme="dark"', () => {
    const switches = [...css.matchAll(/([^{}]+)\{\s*--is-dark:\s*;\s*\}/g)].map((m) => m[1].trim())
    expect(switches).toEqual([":root:not([data-theme='light'])", ":root[data-theme='dark']"])
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)/)
  })

  it('has one device rule and no second block of dark values', () => {
    expect(css.match(/prefers-color-scheme/g)).toHaveLength(1)
    expect(css).not.toMatch(/data-theme='dark'\][^{]*\{[^}]*--(ground|surface|text)\b/)
  })
})
