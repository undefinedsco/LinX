import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

let composerModule
let cleanup

test.before(async () => {
  const loaded = await loadWatchModule('lib/watch/codex-composer.ts')
  composerModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('CodexComposer renders a Codex-style placeholder prompt', () => {
  const composer = new composerModule.CodexComposer()
  composer.beginPrompt('you> ')

  const rendered = composer.render(40)

  assert.deepEqual(rendered.lines, [
    {
      prefix: '› ',
      text: 'Ask LinX to do anything',
      isPlaceholder: true,
    },
  ])
  assert.equal(rendered.cursorRow, 0)
  assert.equal(rendered.cursorCol, 3)
})

test('CodexComposer supports inline editing and cursor movement', () => {
  const composer = new composerModule.CodexComposer()
  composer.beginPrompt('you> ')
  composer.insert('hello')
  composer.moveLeft()
  composer.moveLeft()
  composer.insert('X')

  assert.equal(composer.text(), 'helXlo')

  composer.moveToStart()
  composer.deleteForward()
  assert.equal(composer.text(), 'elXlo')

  composer.moveToEnd()
  composer.backspace()
  assert.equal(composer.text(), 'elXl')

  composer.moveToStart()
  composer.deleteToEnd()
  assert.equal(composer.text(), '')
})

test('CodexComposer restores prior drafts when leaving history navigation', () => {
  const composer = new composerModule.CodexComposer()
  composer.beginPrompt('you> ')
  composer.recordSubmission('first turn')
  composer.recordSubmission('second turn')
  composer.setText('draft in progress')

  assert.equal(composer.navigateHistory('up'), true)
  assert.equal(composer.text(), 'second turn')
  assert.equal(composer.isBrowsingHistory(), true)

  assert.equal(composer.navigateHistory('up'), true)
  assert.equal(composer.text(), 'first turn')

  assert.equal(composer.navigateHistory('down'), true)
  assert.equal(composer.text(), 'second turn')

  assert.equal(composer.navigateHistory('down'), true)
  assert.equal(composer.text(), 'draft in progress')
  assert.equal(composer.isBrowsingHistory(), false)
})

test('CodexComposer keeps wrapped cursor placement aligned with rendered rows', () => {
  const composer = new composerModule.CodexComposer()
  composer.beginPrompt('you> ')
  composer.setText('abcdefghijklmnop', 12)

  const rendered = composer.render(10)

  assert.deepEqual(rendered.lines, [
    { prefix: '› ', text: 'abcdefgh', isPlaceholder: false },
    { prefix: '  ', text: 'ijklmnop', isPlaceholder: false },
  ])
  assert.equal(rendered.cursorRow, 1)
  assert.equal(rendered.cursorCol, 7)
})
