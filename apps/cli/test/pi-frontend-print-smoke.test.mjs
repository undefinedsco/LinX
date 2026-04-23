import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = join(cliRoot, 'src')
const entryPath = join(sourceRoot, 'index.ts')

test('compiled cli default --print accepts a prompt argument and starts the pi path', async (t) => {
  const outdir = mkdtempSync(join(tmpdir(), 'linx-cli-pi-print-'))
  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
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

  let output = ''
  try {
    output = execFileSync(process.execPath, [
      join(outdir, 'index.js'),
      '--print',
      'say hi',
      '--cwd',
      cliRoot,
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
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'test-key',
      },
    })
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }

  assert.doesNotMatch(output, /Unknown argument: say hi/)
  assert.doesNotMatch(output, /Local websocket port used by the native Codex proxy backend/)
  assert.doesNotMatch(output, /pi-frontend/)
})
