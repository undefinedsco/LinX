import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const cliRoot = fileURLToPath(new URL('..', import.meta.url))

test('bundled Pi plugin helper copies configured plugins and verifies config paths', async (t) => {
  const module = await import('../scripts/bundled-pi-plugins.mjs')
  const targetRoot = mkdtempSync(join(tmpdir(), 'linx-bundled-pi-plugins-'))
  t.after(() => {
    rmSync(targetRoot, { recursive: true, force: true })
  })

  mkdirSync(targetRoot, { recursive: true })
  module.copyBundledPiPlugins({
    repoRoot,
    targetRoot,
  })

  module.assertBundledPiPluginsInstalled(targetRoot)
  module.assertBundledPiPluginConfigPaths(targetRoot)
})

test('bundled Pi plugin helper can be invoked as a scoped copy script', async (t) => {
  const targetRoot = mkdtempSync(join(tmpdir(), 'linx-bundled-pi-plugins-cli-'))
  t.after(() => {
    rmSync(targetRoot, { recursive: true, force: true })
  })

  const output = execFileSync(process.execPath, [
    join(cliRoot, 'scripts', 'bundled-pi-plugins.mjs'),
    '--target-root',
    targetRoot,
    'pi-web-access',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.match(output, /bundled pi-web-access/)
  assert.equal(existsSync(join(targetRoot, 'vendor', 'pi-web-access', 'package.json')), true)
})
