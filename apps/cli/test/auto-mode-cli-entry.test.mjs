import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = join(cliRoot, 'src')
const entryPath = join(sourceRoot, 'index.ts')

function execFileResult(command, args, options = {}) {
  try {
    return {
      status: 0,
      stdout: execFileSync(command, args, options),
      stderr: '',
    }
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout?.toString?.() ?? '',
      stderr: error.stderr?.toString?.() ?? String(error),
    }
  }
}

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

test('compiled cli keeps --auto as auto control, not backend entry', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-auto-flag-'))
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
    () => execFileSync(process.execPath, [join(outdir, 'index.js'), '--auto', '--print', 'hello'], {
      cwd: cliRoot,
      env: {
        ...process.env,
        HOME: join(outdir, 'empty-home'),
      },
      encoding: 'utf-8',
      stdio: 'pipe',
    }),
    (error) => {
      const output = String(error)
      assert.match(output, /run `linx login` first/i)
      assert.doesNotMatch(output, /Usage: linx --backend/)
      return true
    },
  )
})

test('compiled cli routes Codex --backend through the ACP auto-mode path', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-backend-flag-'))
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

  const result = execFileResult(process.execPath, [join(outdir, 'index.js'), '--backend', 'codex', '--print', 'hello'], {
    cwd: cliRoot,
    env: {
      ...process.env,
      HOME: join(outdir, 'empty-home'),
      LINX_HOME: join(outdir, 'linx-home'),
    },
    encoding: 'utf-8',
    stdio: 'pipe',
  })
  const output = [result.stdout, result.stderr].join('')

  assert.match(output, /Codex/)
  assert.match(output, /backend: codex/)
  assert.match(output, /cmd: .*codex-acp/)
  assert.doesNotMatch(output, /native codex proxy/i)
  assert.doesNotMatch(output, /Usage: linx --backend/)
})

test('compiled cli keeps explicit backend entry points on auto-mode path', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-non-codex-backends-'))
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

  for (const [backend, label] of [
    ['codex', 'Codex'],
    ['claude', 'Claude Code'],
    ['codebuddy', 'CodeBuddy Code'],
  ]) {
    assert.throws(
      () => execFileSync(process.execPath, [join(outdir, 'index.js'), '--backend', backend, '--plain', 'hello'], {
        cwd: cliRoot,
        env: {
          ...process.env,
          HOME: join(outdir, `${backend}-empty-home`),
          LINX_HOME: join(outdir, `${backend}-linx-home`),
          LINX_BACKEND_PLAIN: '1',
        },
        input: '3\n',
        encoding: 'utf-8',
        stdio: 'pipe',
      }),
      (error) => {
        const output = [
          error.stdout?.toString?.() ?? '',
          error.stderr?.toString?.() ?? '',
          String(error),
        ].join('')
        assert.match(output, new RegExp(label))
        assert.match(output, new RegExp(`backend: ${backend}`))
        assert.match(output, /LinX Cloud login required|run `linx login` first/i)
        assert.doesNotMatch(output, /is not available in the unified LinX TUI yet/)
        assert.doesNotMatch(output, /Usage: linx --backend/)
        return true
      },
    )
  }
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

  assert.throws(
    () => execFileSync(process.execPath, [join(outdir, 'index.js'), 'resume', '019df-test'], {
      cwd: cliRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    }),
    /Unknown command: resume/,
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

test('compiled cli entry keeps codex-native-proxy callable but hidden from top-level help', async (t) => {
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
  const topLevelHelp = execFileSync(process.execPath, [join(outdir, 'index.js'), '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /codex-native-proxy/)
  assert.match(output, /websocket/i)
  assert.match(output, /--port/)
  assert.doesNotMatch(topLevelHelp, /codex-native-proxy/)
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
  assert.match(output, /Run LinX with the selected runtime backend/i)
  assert.match(output, /runtime-url/)
  assert.match(output, /--backend/)
  assert.match(output, /--print/)
  assert.match(output, /--continue/)
  assert.match(output, /--resume/)
  assert.match(output, /--session/)
  assert.match(output, /--session-id/)
  assert.match(output, /--session-dir/)
  assert.doesNotMatch(output, /automode/)
  assert.doesNotMatch(output, /auto-mode/)
  assert.doesNotMatch(output, /--plain/)
  assert.doesNotMatch(output, /--sessions/)
  assert.doesNotMatch(output, /fork \[thread\]/)
  assert.doesNotMatch(output, /--show/)
  assert.doesNotMatch(output, /linx resume \[session\]/)
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
  assert.match(output, /linx config <section>/)
  assert.doesNotMatch(output, /linx status-line/)
  assert.doesNotMatch(output, /pi install/)
})

test('compiled cli config status-line command configures app-local footer tokens', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-status-line-'))
  const linxHome = mkdtempSync(join(cliRoot, '.tmp-linx-status-line-home-'))
  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
    rmSync(linxHome, { recursive: true, force: true })
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

  const env = {
    ...process.env,
    LINX_HOME: linxHome,
  }
  const cli = join(outdir, 'index.js')
  const setOutput = execFileSync(process.execPath, [
    cli,
    'config',
    'status-line',
    'set',
    'model-with-reasoning',
    'git-branch',
    'context-remaining',
    '--no-colors',
  ], {
    cwd: cliRoot,
    env,
    encoding: 'utf-8',
  })
  const showOutput = execFileSync(process.execPath, [cli, 'config', 'status-line'], {
    cwd: cliRoot,
    env,
    encoding: 'utf-8',
  })
  const tokensOutput = execFileSync(process.execPath, [cli, 'config', 'status-line', 'tokens'], {
    cwd: cliRoot,
    env,
    encoding: 'utf-8',
  })
  execFileSync(process.execPath, [cli, 'config', 'status-line', 'reset'], {
    cwd: cliRoot,
    env,
    encoding: 'utf-8',
  })
  const resetOutput = execFileSync(process.execPath, [cli, 'config', 'status-line'], {
    cwd: cliRoot,
    env,
    encoding: 'utf-8',
  })
  const topLevelStatusLine = execFileResult(process.execPath, [cli, 'status-line'], {
    cwd: cliRoot,
    env,
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  const config = JSON.parse(readFileSync(join(linxHome, 'config.json'), 'utf-8'))
  assert.match(setOutput, /Updated LinX status line/)
  assert.match(showOutput, /tokens: model-with-reasoning, git-branch, context-remaining/)
  assert.match(showOutput, /colors: off/)
  assert.match(tokensOutput, /context-remaining/)
  assert.equal(config.status_line, undefined)
  assert.equal(config.status_line_use_colors, undefined)
  assert.match(resetOutput, /tokens source: default/)
  assert.notEqual(topLevelStatusLine.status, 0)
  assert.match(topLevelStatusLine.stderr, /Unknown command: status-line/)
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

test('cli build ships product skills for the Pi resource loader', async (t) => {
  execFileSync('node', ['scripts/build.mjs'], {
    cwd: cliRoot,
    stdio: 'pipe',
  })

  const distSkills = readdirSync(join(cliRoot, 'dist', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  assert.deepEqual(distSkills, ['symphony', 'xpod-cli'])
  for (const skill of distSkills) {
    assert.ok(existsSync(join(cliRoot, 'dist', 'skills', skill, 'SKILL.md')), `${skill} should include SKILL.md`)
  }
})

test('compiled cli auto-mode show replays archived timeline instead of raw json', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-show-'))
  const linxHome = mkdtempSync(join(cliRoot, '.tmp-linx-home-'))
  const autoModeHome = join(linxHome, 'auto-mode')

  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
    rmSync(linxHome, { recursive: true, force: true })
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
autoEnabled: true,
mode: 'auto',
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
      LINX_HOME: linxHome,
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

test('compiled cli can list archived auto-mode sessions with pending Pod sync', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-sync-status-'))
  const linxHome = mkdtempSync(join(cliRoot, '.tmp-linx-sync-status-'))
  const autoModeHome = join(linxHome, 'auto-mode')

  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
    rmSync(linxHome, { recursive: true, force: true })
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

  const failedSessionId = 'auto_failed_sync_123'
  const completedSessionId = 'auto_completed_sync_123'
  for (const [sessionId, status] of [[failedSessionId, 'failed'], [completedSessionId, 'completed']]) {
    const sessionDir = join(autoModeHome, 'sessions', sessionId)
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(join(sessionDir, 'session.json'), JSON.stringify({
      id: sessionId,
      backend: 'codex',
      runtime: 'local',
      transport: 'acp',
      autoEnabled: true,
      mode: 'auto',
      cwd: '/tmp/demo',
      passthroughArgs: [],
      credentialSource: 'cloud',
      command: 'codex-acp',
      args: [],
      status: 'completed',
      startedAt: sessionId === failedSessionId ? '2026-03-17T00:00:00.000Z' : '2026-03-16T00:00:00.000Z',
      endedAt: sessionId === failedSessionId ? '2026-03-17T00:01:00.000Z' : '2026-03-16T00:01:00.000Z',
      archiveDir: sessionDir,
      eventsFile: join(sessionDir, 'events.jsonl'),
    }, null, 2))
    writeFileSync(join(sessionDir, 'events.jsonl'), '')
    writeFileSync(join(sessionDir, 'sync.json'), JSON.stringify({
      'auto-mode-archive:pod:projection': {
        id: 'auto-mode-archive:pod:projection',
        source: 'auto-mode-archive',
        target: 'pod',
        direction: 'local-to-core',
        plane: 'projection',
        authority: 'core',
        status,
        attempted: 1,
        applied: status === 'completed' ? 1 : 0,
        skipped: 0,
        failed: status === 'completed' ? 0 : 1,
        failures: status === 'completed' ? [] : [{ operationId: 'test', message: 'failed' }],
        startedAt: '2026-03-17T00:00:00.000Z',
        completedAt: '2026-03-17T00:00:01.000Z',
      },
    }, null, 2))
  }

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), '--sync-status'], {
    cwd: cliRoot,
    env: {
      ...process.env,
      LINX_HOME: linxHome,
    },
    encoding: 'utf-8',
  })

  assert.match(output, new RegExp(failedSessionId))
  assert.doesNotMatch(output, new RegExp(completedSessionId))
})

test('compiled cli can list Pi sessions with pending Pod mirror sync', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-pi-sync-status-'))
  const home = mkdtempSync(join(cliRoot, '.tmp-linx-pi-sync-home-'))

  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
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

  const failedSessionId = '019df000-aaaa-bbbb-cccc-000000000001'
  const completedSessionId = '019df000-aaaa-bbbb-cccc-000000000002'
  for (const [sessionId, status] of [[failedSessionId, 'failed'], [completedSessionId, 'completed']]) {
    const syncDir = join(home, '.solid', 'apps', 'linx', 'agent', 'sync', 'pi-pod-mirror', sessionId)
    mkdirSync(syncDir, { recursive: true })
    const checkpointId = `pi-pod-mirror:${sessionId}:2026-04-01T00-00-00-000Z:1`
    writeFileSync(join(syncDir, `${encodeURIComponent(checkpointId)}.json`), JSON.stringify({
      id: checkpointId,
      source: 'pi-runtime',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'projection',
      authority: 'core',
      status,
      attempted: 1,
      applied: status === 'completed' ? 1 : 0,
      skipped: 0,
      failed: status === 'completed' ? 0 : 1,
      failures: status === 'completed' ? [] : [{ operationId: 'test', message: 'failed' }],
      startedAt: '2026-04-01T00:00:00.000Z',
      completedAt: '2026-04-01T00:00:01.000Z',
      metadata: {
        resourceBindings: {
          session: {
            local: sessionId,
          },
        },
      },
    }, null, 2))
  }

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), '--pi-sync-status'], {
    cwd: cliRoot,
    env: {
      ...process.env,
      HOME: home,
    },
    encoding: 'utf-8',
  })

  assert.match(output, new RegExp(failedSessionId))
  assert.doesNotMatch(output, new RegExp(completedSessionId))
})

test('compiled cli resume selector initializes theme before rendering', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-resume-selector-'))
  const home = mkdtempSync(join(cliRoot, '.tmp-linx-cli-resume-home-'))

  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
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

  const result = spawnSync(process.execPath, [join(outdir, 'index.js'), '-r'], {
    cwd: cliRoot,
    env: {
      ...process.env,
      HOME: home,
      LINX_HOME: join(home, '.linx'),
      SOLID_HOME: join(home, '.solid'),
    },
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 1500,
  })
  const output = [
    result.stdout,
    result.stderr,
    result.error?.message ?? '',
  ].join('')

  assert.doesNotMatch(output, /Theme not initialized/)
  assert.doesNotMatch(output, /Call initTheme\(\) first/)
})
