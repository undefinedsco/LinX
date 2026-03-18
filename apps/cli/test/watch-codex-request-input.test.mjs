import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

let requestInputModule
let cleanup

test.before(async () => {
  const loaded = await loadWatchModule('lib/watch/codex-request-input.ts')
  requestInputModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('renderCodexRequestInput renders progress question and selected option', () => {
  const lines = requestInputModule.renderCodexRequestInput(
    {
      header: 'Runtime',
      question: 'Choose runtime',
      options: [
        { label: 'local', value: 'local', shortcuts: ['1'] },
        { label: 'cloud', value: 'cloud', description: 'Use Pod credentials', shortcuts: ['2'] },
      ],
      selectedIndex: 1,
      questionIndex: 0,
      questionCount: 2,
      unansweredCount: 2,
    },
    64,
    16,
  )

  assert.match(lines[0], /Runtime/)
  assert.ok(lines.some((line) => /Question 1\/2 \(2 unanswered\)/.test(line)))
  assert.ok(lines.some((line) => /Choose runtime/.test(line)))
  assert.ok(lines.some((line) => /› 2\. cloud \[2\]/.test(line)))
  assert.ok(lines.some((line) => /Use Pod credentials/.test(line)))
})

test('renderCodexRequestInputDetailed renders inline freeform answer composer', () => {
  const rendered = requestInputModule.renderCodexRequestInputDetailed(
    {
      header: 'Goal',
      question: 'Describe the goal',
      options: [],
      selectedIndex: 0,
      questionIndex: 0,
      questionCount: 1,
      unansweredCount: 1,
      answerValue: '',
      answerCursor: 0,
    },
    64,
    16,
  )

  assert.ok(rendered.lines.some((line) => /Type your answer/.test(line)))
  assert.ok(rendered.lines.some((line) => /Type your answer \| Enter confirm/.test(line)))
  assert.equal(typeof rendered.cursorLineIndex, 'number')
  assert.equal(typeof rendered.cursorCol, 'number')
})

test('renderCodexRequestInput keeps selected option visible when height is constrained', () => {
  const lines = requestInputModule.renderCodexRequestInput(
    {
      header: 'Runtime',
      question: 'Choose runtime',
      options: [
        {
          label: 'Option one',
          value: 'one',
          description: 'A deliberately long description that consumes multiple rows in the constrained popup viewport.',
          shortcuts: ['1'],
        },
        {
          label: 'Option two',
          value: 'two',
          description: 'Another long description that would normally push later options out of view if we only clipped from the top.',
          shortcuts: ['2'],
        },
        {
          label: 'Option three',
          value: 'three',
          description: 'Selected option should remain visible.',
          shortcuts: ['3'],
        },
      ],
      selectedIndex: 2,
      questionIndex: 0,
      questionCount: 1,
      unansweredCount: 1,
    },
    64,
    11,
  )

  assert.ok(lines.some((line) => /› 3\. Option three \[3\]/.test(line)))
  assert.ok(lines.some((line) => /option 3\/3/.test(line)))
})
