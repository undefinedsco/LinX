import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

let footerModule
let cleanup

test.before(async () => {
  const loaded = await loadAutoModeModule('lib/auto-mode/codex-footer.ts')
  footerModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('singleLineFooterLayout keeps context when both sides fit', () => {
  const layout = footerModule.singleLineFooterLayout(72, '/help · /exit', 'codex · smart · cloud')

  assert.equal(layout.left, '/help · /exit')
  assert.equal(layout.showContext, true)
})

test('singleLineFooterLayout drops context before left hint when width is tight', () => {
  const layout = footerModule.singleLineFooterLayout(28, '/help · /exit', 'codex · smart · cloud')

  assert.equal(layout.left, '/help · /exit')
  assert.equal(layout.showContext, false)
})

test('renderFooterLine right-aligns context with Codex footer indentation', () => {
  const line = footerModule.renderFooterLine(
    {
      mode: 'ComposerEmpty',
      emptyHint: '/help · /exit',
      draftHint: 'Enter to send',
      context: 'codex · smart · cloud',
    },
    72,
  )

  assert.equal(line.length, 72)
  assert.match(line, /^\s{2}\/help · \/exit/)
  assert.match(line, /codex · smart · cloud\s*$/)
})
