import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = join(cliRoot, 'src')
const entryPath = join(sourceRoot, 'index.ts')
const require = createRequire(import.meta.url)
const tscBin = require.resolve('typescript/bin/tsc')

test('compiled cli entry can serve watch commands without chat dependencies', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-entry-'))
  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
  })

  try {
    execFileSync(process.execPath, [tscBin,
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

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), 'watch', 'backends'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /codex/i)
  assert.match(output, /claude/i)
  assert.match(output, /codebuddy/i)
})

test('compiled cli entry exposes codex-native-proxy command help', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-native-proxy-'))
  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
  })

  try {
    execFileSync(process.execPath, [tscBin,
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

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), 'codex-native-proxy', '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /codex-native-proxy/)
  assert.match(output, /websocket/i)
  assert.match(output, /--port/)
})

test('compiled cli default entry is Pi TUI and hides explicit frontend aliases', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-pi-'))
  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
  })

  try {
    execFileSync(process.execPath, [tscBin,
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

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /linx \[prompt\.\.\]/)
  assert.match(output, /native Pi TUI/i)
  assert.match(output, /runtime-url/)
  assert.match(output, /--backend/)
  assert.match(output, /--print/)
  assert.doesNotMatch(output, /pi-frontend/)
  assert.doesNotMatch(output, /linx pi /)
})

test('compiled cli login help exposes browser consent flow and no password options', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-login-help-'))
  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
  })

  try {
    execFileSync(process.execPath, [tscBin,
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

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), 'login', '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /browser/i)
  assert.match(output, /OIDC/i)
  assert.doesNotMatch(output, /email/i)
  assert.doesNotMatch(output, /password/i)
})

test('compiled cli watch show replays archived timeline instead of raw json', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-show-'))
  const watchHome = mkdtempSync(join(cliRoot, '.tmp-linx-watch-home-'))

  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
    rmSync(watchHome, { recursive: true, force: true })
  })

  try {
    execFileSync(process.execPath, [tscBin,
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

  const sessionId = 'watch_demo_123'
  const sessionDir = join(watchHome, 'sessions', sessionId)
  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(join(sessionDir, 'session.json'), JSON.stringify({
    id: sessionId,
    backend: 'claude',
    runtime: 'local',
    mode: 'smart',
    cwd: '/tmp/demo',
    passthroughArgs: [],
    credentialSource: 'auto',
    resolvedCredentialSource: 'cloud',
    command: 'claude',
    args: ['--print', 'hello'],
    status: 'completed',
    startedAt: '2026-03-17T00:00:00.000Z',
    endedAt: '2026-03-17T00:01:00.000Z',
    archiveDir: sessionDir,
    eventsFile: join(sessionDir, 'events.jsonl'),
  }, null, 2))
  writeFileSync(join(sessionDir, 'events.jsonl'), `${JSON.stringify({
    timestamp: '2026-03-17T00:00:01.000Z',
    stream: 'system',
    line: JSON.stringify({ type: 'user.turn', text: 'hello' }),
    events: [],
  })}\n${JSON.stringify({
    timestamp: '2026-03-17T00:00:02.000Z',
    stream: 'stdout',
    line: JSON.stringify({ type: 'assistant', text: 'hi there' }),
    events: [{ type: 'assistant.done', text: 'hi there' }],
  })}\n`)

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), 'watch', 'show', sessionId], {
    cwd: cliRoot,
    env: {
      ...process.env,
      LINX_WATCH_HOME: watchHome,
    },
    encoding: 'utf-8',
  })

  assert.match(output, /LinX watch history/)
  assert.match(output, /backend: claude/)
  assert.match(output, /you> hello/)
  assert.match(output, /assistant> hi there/)
  assert.doesNotMatch(output, /"backend": "claude"/)
})
