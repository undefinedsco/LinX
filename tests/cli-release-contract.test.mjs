import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))

test('CLI release package depends on the pinned xpod CLI used by product skills', () => {
  const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const cliPackage = JSON.parse(readFileSync(join(root, 'apps/cli/package.json'), 'utf8'))
  assert.equal(
    cliPackage.dependencies?.['@undefineds.co/xpod'],
    rootPackage.dependencies?.['@undefineds.co/xpod'],
  )
})

test('CLI release smoke verifies the installed xpod package version', () => {
  const smoke = readFileSync(join(root, 'scripts/smoke-install-cli-release.mjs'), 'utf8')
  assert.match(smoke, /const xpodVersion = cliPackage\.dependencies\?\.\['@undefineds\.co\/xpod'\]/)
  assert.match(smoke, /assertInstalledXpodVersion\(xpodVersion\)/)
  assert.match(smoke, /findInstalledPackageRoot\('@undefineds\.co\/xpod'\)/)
})
