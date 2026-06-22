import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('resume output module suppresses upstream Pi resume hints and preserves LinX resume output', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-resume-output.ts')
  t.after(() => cleanup())
  const writes = captureProcessStreamWrites(t, process.stdout)

  await module.withLinxResumeOutputStyle(async () => {
    process.stdout.write('\x1b[2mTo resume this session:')
    process.stdout.write('\x1b[22m pi --session-dir /Users/ganlu/.solid/apps/linx/agent/sessions ')
    process.stdout.write('--session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
    process.stdout.write('Resume: linx --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
  })

  assert.equal(writes.join(''), 'Resume: linx --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
})

test('exit message stays suppressed after restart even when the command runner stops the interactive shell again', async (t) => {
  const lifecycle = await loadAutoModeModule('lib/shell-lifecycle.ts')
  const resume = await loadAutoModeModule('lib/linx-resume-output.ts')
  t.after(() => {
    lifecycle.cleanup()
    resume.cleanup()
  })

  const previousNoExitMessage = process.env[lifecycle.module.LINX_TUI_NO_EXIT_MESSAGE_ENV]
  const previousIsTTY = process.stdout.isTTY
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
  delete process.env[lifecycle.module.LINX_TUI_NO_EXIT_MESSAGE_ENV]
  t.after(() => {
    restoreEnv(lifecycle.module.LINX_TUI_NO_EXIT_MESSAGE_ENV, previousNoExitMessage)
    Object.defineProperty(process.stdout, 'isTTY', { value: previousIsTTY, configurable: true })
  })

  const writes = captureProcessStreamWrites(t, process.stdout)
  const childHandlers = {}
  const interactive = {
    initialized: false,
    init() {
      this.initialized = true
    },
    stop() {},
    session: {
      sessionId: '019e-restart-session',
      getContextUsage() {
        return { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }
      },
    },
  }
  resume.module.installLinxExitMessage(interactive)
  resume.module.markLinxExitMessageInitialized(interactive)

  const restart = lifecycle.module.restartInteractiveShellProcess(interactive, {
    runtime: {
      execPath: '/usr/local/bin/node',
      argv: ['/usr/local/bin/node', '/usr/local/bin/linx', '--session', '019e-restart-session'],
      env: process.env,
      cwd() {
        return '/workspace/project'
      },
      spawnProcess() {
        return {
          on(event, handler) {
            childHandlers[event] = handler
            return this
          },
        }
      },
      exitProcess() {},
      defer(callback) {
        callback()
      },
    },
  })
  childHandlers.close(0, null)
  await restart

  interactive.stop()

  assert.equal(
    writes.join('').includes('LinX session closed.'),
    false,
    'restart path must not print the normal session-closed copy even if runner cleanup calls stop again',
  )
  assert.equal(writes.join('').includes('Resume: linx --session'), false)
})

test('exit message prints only after post-init lifecycle marks initialization', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-resume-output.ts')
  t.after(() => cleanup())

  const previousNoExitMessage = process.env.LINX_TUI_NO_EXIT_MESSAGE
  const previousIsTTY = process.stdout.isTTY
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
  delete process.env.LINX_TUI_NO_EXIT_MESSAGE
  t.after(() => {
    restoreEnv('LINX_TUI_NO_EXIT_MESSAGE', previousNoExitMessage)
    Object.defineProperty(process.stdout, 'isTTY', { value: previousIsTTY, configurable: true })
  })

  const writes = captureProcessStreamWrites(t, process.stdout)
  const interactive = {
    stop() {},
    session: {
      sessionId: '019e-post-init-session',
      getContextUsage() {
        return { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }
      },
    },
  }

  module.installLinxExitMessage(interactive)
  interactive.stop()
  assert.equal(writes.join(''), '')

  module.markLinxExitMessageInitialized(interactive)
  interactive.stop()

  assert.match(writes.join(''), /LinX session closed\./)
  assert.match(writes.join(''), /Resume: linx --session 019e-post-init-session/)
})

function captureProcessStreamWrites(t, stream) {
  const originalWrite = stream.write
  const writes = []
  stream.write = ((chunk, encodingOrCallback, callback) => {
    writes.push(String(chunk))
    if (typeof encodingOrCallback === 'function') {
      encodingOrCallback()
    } else if (typeof callback === 'function') {
      callback()
    }
    return true
  })
  t.after(() => {
    stream.write = originalWrite
  })
  return writes
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
