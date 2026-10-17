import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

// scripts/contrast-audit.mjs measures every colour pairing the components use against DESIGN.md's floors.
it('every colour pairing in use meets its contrast floor in both modes', () => {
  const script = fileURLToPath(new URL('../scripts/contrast-audit.mjs', import.meta.url))
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  expect(run.status, run.stdout + run.stderr).toBe(0)
})
