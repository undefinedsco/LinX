import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const requireFromCli = createRequire(join(cliRoot, 'package.json'))
const localTscBin = requireFromCli.resolve('typescript/bin/tsc')
const sourceRoot = join(cliRoot, 'src')
const entryPath = join(sourceRoot, 'index.ts')

function compileMainCliEntry(t) {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-pi-print-'))
  let compileOutput = ''
  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
  })

  try {
    execFileSync(process.execPath, [localTscBin,
      '--ignoreConfig',
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
  } catch (error) {
    compileOutput = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
  }

  return resolveEmittedEntry(outdir, 'index.js', compileOutput)
}

function resolveEmittedEntry(outdir, entryName, compileOutput = '') {
  const direct = join(outdir, entryName)
  if (existsSync(direct)) return direct

  const matches = findFiles(outdir, entryName)
  const preferred = matches.find((file) => file.endsWith(`/src/${entryName}`))
    ?? matches.find((file) => file.endsWith(`\\src\\${entryName}`))
    ?? matches.sort((a, b) => a.length - b.length)[0]

  assert.ok(
    preferred,
    `Expected emitted ${entryName}; emitted files: ${findFiles(outdir).join(', ') || '(none)'}${compileOutput ? `\n${compileOutput}` : ''}`,
  )
  return preferred
}

function findFiles(dir, basename) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findFiles(path, basename))
    } else if (!basename || entry.name === basename) {
      files.push(path)
    }
  }
  return files
}

test('compiled cli default --print accepts a prompt argument and starts the pi path', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'linx-cli-pi-print-home-'))
  const workspace = mkdtempSync(join(tmpdir(), 'linx-cli-pi-print-workspace-'))
  t.after(() => {
    rmSync(home, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  })

  const entry = compileMainCliEntry(t)
  const result = spawnSync(process.execPath, [
    entry,
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
