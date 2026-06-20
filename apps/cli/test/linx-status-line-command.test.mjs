import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('status line shell command writes config and refreshes the shell footer', async (t) => {
  const linxHome = mkdtempSync(join(tmpdir(), 'linx-status-line-command-home-'))
  const previous = process.env.LINX_HOME
  process.env.LINX_HOME = linxHome
  t.after(() => {
    if (previous === undefined) delete process.env.LINX_HOME
    else process.env.LINX_HOME = previous
  })

  const { module, cleanup } = await loadAutoModeModule('lib/linx-status-line-command.ts')
  t.after(() => cleanup())

  const events = []
  const interactive = {
    footer: {
      invalidate() {
        events.push('footer')
      },
    },
    showStatus(message) {
      events.push(['status', message])
    },
    ui: {
      requestRender() {
        events.push('render')
      },
    },
  }

  await module.handleInteractiveStatusLineCommand(interactive, ['set', 'model-with-reasoning', 'git-branch'])
  await module.handleInteractiveStatusLineCommand(interactive, ['colors', 'off'])

  const config = module.readLinxStatusLineConfig()
  assert.deepEqual(config.tokens, ['model-with-reasoning', 'git-branch'])
  assert.equal(config.useColors, false)
  assert.deepEqual(events.at(-3), 'footer')
  assert.deepEqual(events.at(-2), ['status', 'Status line colors disabled.'])
  assert.deepEqual(events.at(-1), 'render')
})
