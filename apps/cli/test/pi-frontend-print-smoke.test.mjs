import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = join(cliRoot, 'src')
const entryPath = join(sourceRoot, 'index.ts')

test('compiled cli default --print accepts a prompt argument and starts the pi path', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-pi-print-'))
  const home = mkdtempSync(join(tmpdir(), 'linx-cli-pi-print-home-'))
  const workspace = mkdtempSync(join(tmpdir(), 'linx-cli-pi-print-workspace-'))
  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  })

  try {
    execFileSync('tsc', [
      '--outDir',
      outdir,
      '--rootDir',
      sourceRoot,
      '--module',
      'nodenext',
      '--moduleResolution',
      'nodenext',
      '--target',
      'ES2022',
      '--lib',
      'ES2022',
      '--types',
      'node',
      '--skipLibCheck',
      'true',
      '--noEmitOnError',
      'false',
      entryPath,
    ], {
      cwd: cliRoot,
      stdio: 'pipe',
    })
  } catch {
    assert.ok(existsSync(join(outdir, 'index.js')))
  }
  const result = spawnSync(process.execPath, [
    join(outdir, 'index.js'),
    '--print',
    'say hi',
    '--cwd',
    workspace,
    '--model',
    'gpt-5-codex',
    '--runtime-url',
    'https://api.undefineds.co/v1',
  ], {
    cwd: cliRoot,
    encoding: 'utf-8',
    timeout: 5000,
    env: {
      ...process.env,
      HOME: home,
      LINX_AUTO_MODE_HOME: join(home, '.linx', 'auto-mode'),
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'test-key',
    },
  })

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  assert.notEqual(result.error?.code, 'ETIMEDOUT', output)
  assert.match(output, /No LinX cloud login found|LinX Cloud login/i)
  assert.doesNotMatch(output, /Unknown argument: say hi/)
  assert.doesNotMatch(output, /Local websocket port used by the native Codex proxy backend/)
  assert.doesNotMatch(output, /pi-frontend/)
})
