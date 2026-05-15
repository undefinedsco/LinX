import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const sourceRoot = join(cliRoot, 'src')
const entryPath = join(sourceRoot, 'index.ts')

test('compiled cli entry prints package version instead of unknown', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-version-'))
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

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), '--version'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  }).trim()

  assert.match(output, /^\d+\.\d+\.\d+(?:-.+)?$/)
  assert.notEqual(output, 'unknown')
})

test('compiled cli entry can serve auto-mode flags without chat dependencies', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-entry-'))
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

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), '--list-backends'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /codex/i)
  assert.match(output, /claude/i)
  assert.match(output, /codebuddy/i)
})

test('compiled cli auto-mode rejects retired command surfaces', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-auto-mode-usage-'))
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

  assert.throws(
    () => execFileSync(process.execPath, [join(outdir, 'index.js'), 'automode', 'codex'], {
      cwd: cliRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    }),
    /Unknown command: automode/,
  )

  assert.throws(
    () => execFileSync(process.execPath, [join(outdir, 'index.js'), 'watch', 'codex'], {
      cwd: cliRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    }),
    /Unknown command: watch/,
  )
})

test('dev script routes auto-mode through the main cli command', async (t) => {
  const output = execFileSync(process.execPath, ['scripts/dev.mjs', '--list-backends'], {
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

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /linx \[prompt\.\.\]/)
  assert.match(output, /Run LinX, or control an external agent backend/i)
  assert.match(output, /runtime-url/)
  assert.match(output, /--backend/)
  assert.match(output, /--print/)
  assert.doesNotMatch(output, /automode/)
  assert.doesNotMatch(output, /cloud, native/)
  assert.doesNotMatch(output, /native keeps/)
  assert.doesNotMatch(output, /pi-frontend/)
  assert.doesNotMatch(output, /linx pi /)
})

test('compiled cli exposes LinX package commands in help', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-package-help-'))
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

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /linx install \[source\]/)
  assert.match(output, /linx remove \[source\]/)
  assert.match(output, /linx update \[source\]/)
  assert.match(output, /linx list/)
  assert.doesNotMatch(output, /pi install/)
})

test('compiled cli login help exposes browser consent flow and no password options', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-login-help-'))
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

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), 'login', '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /browser/i)
  assert.match(output, /OIDC/i)
  assert.doesNotMatch(output, /email/i)
  assert.doesNotMatch(output, /password/i)
})

test('cli build ships repository skills for the Pi resource loader', async (t) => {
  execFileSync('node', ['scripts/build.mjs'], {
    cwd: cliRoot,
    stdio: 'pipe',
  })

  const sourceSkills = readdirSync(join(repoRoot, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const distSkills = readdirSync(join(cliRoot, 'dist', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  assert.deepEqual(distSkills, sourceSkills)
  for (const skill of sourceSkills) {
    assert.ok(existsSync(join(cliRoot, 'dist', 'skills', skill, 'SKILL.md')), `${skill} should include SKILL.md`)
  }
})

test('compiled cli auto-mode show replays archived timeline instead of raw json', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-show-'))
  const autoModeHome = mkdtempSync(join(cliRoot, '.tmp-linx-auto-mode-home-'))

  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
    rmSync(autoModeHome, { recursive: true, force: true })
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

  const sessionId = 'auto_demo_123'
  const sessionDir = join(autoModeHome, 'sessions', sessionId)
  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(join(sessionDir, 'session.json'), JSON.stringify({
    id: sessionId,
    backend: 'claude',
    runtime: 'local',
    mode: 'smart',
    cwd: '/tmp/demo',
    passthroughArgs: [],
    credentialSource: 'cloud',
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

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), '--show', sessionId], {
    cwd: cliRoot,
    env: {
      ...process.env,
      LINX_AUTO_MODE_HOME: autoModeHome,
    },
    encoding: 'utf-8',
  })

  assert.match(output, /Claude Code session history/)
  assert.match(output, /controlled by: LinX/)
  assert.match(output, /backend: claude/)
  assert.match(output, /you> hello/)
  assert.match(output, /assistant> hi there/)
  assert.doesNotMatch(output, /"backend": "claude"/)
})
