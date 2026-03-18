import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

let requestFormModule
let cleanup

test.before(async () => {
  const loaded = await loadWatchModule('lib/watch/codex-request-form.ts')
  requestFormModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

function createQuestions() {
  return [
    {
      id: 'runtime',
      header: 'Runtime',
      question: 'Choose runtime',
      options: [
        { label: 'local' },
        { label: 'cloud', description: 'Use Pod credentials' },
      ],
    },
    {
      id: 'goal',
      header: 'Goal',
      question: 'Describe the goal',
      options: [],
    },
  ]
}

function createThreeQuestions() {
  return [
    ...createQuestions(),
    {
      id: 'priority',
      header: 'Priority',
      question: 'Choose priority',
      options: [
        { label: 'p1' },
        { label: 'p2' },
      ],
    },
  ]
}

test('CodexRequestForm exposes current question state with aggregate unanswered count', () => {
  const form = new requestFormModule.CodexRequestForm(createQuestions())
  const state = form.currentState()

  assert.equal(state.header, 'Runtime')
  assert.equal(state.questionIndex, 0)
  assert.equal(state.questionCount, 2)
  assert.equal(state.unansweredCount, 2)
  assert.match(state.footerHint, /Enter next/)
})

test('CodexRequestForm advances across questions and submits one combined answer record', () => {
  const form = new requestFormModule.CodexRequestForm(createQuestions())

  let result = form.applyKey('2', { name: '2' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.currentState().header, 'Goal')
  assert.equal(form.currentState().unansweredCount, 1)

  for (const char of 'Ship a Codex-like watch TUI') {
    result = form.applyKey(char, { name: char })
    assert.equal(result.kind, 'updated')
  }

  result = form.applyKey('\n', { name: 'return' })
  assert.equal(result.kind, 'submitted')
  assert.deepEqual(result.answers, {
    runtime: { answers: ['cloud'] },
    goal: { answers: ['Ship a Codex-like watch TUI'] },
  })
})

test('CodexRequestForm keeps highlighted options and freeform drafts unanswered until committed', () => {
  const form = new requestFormModule.CodexRequestForm(createQuestions())

  let result = form.applyKey('', { name: 'down' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.currentState().unansweredCount, 2)

  result = form.applyKey('', { name: 'tab' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.currentState().header, 'Goal')

  for (const char of 'draft only') {
    result = form.applyKey(char, { name: char })
    assert.equal(result.kind, 'updated')
  }

  assert.equal(form.currentState().answerValue, 'draft only')
  assert.equal(form.currentState().unansweredCount, 2)
})

test('CodexRequestForm opens unanswered confirmation instead of submitting immediately', () => {
  const form = new requestFormModule.CodexRequestForm(createQuestions())

  let result = form.applyKey('\n', { name: 'return' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.currentState().header, 'Goal')

  result = form.applyKey('\n', { name: 'return' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.confirmUnansweredActive(), true)

  const overlay = form.confirmationOverlayState()
  assert.equal(overlay?.title, 'Submit with unanswered questions?')
  assert.deepEqual(overlay?.options.map((option) => option.label), ['Proceed', 'Go back'])
  assert.match(overlay?.body[0] ?? '', /1 unanswered question/)
})

test('CodexRequestForm can submit with unanswered questions from confirmation overlay', () => {
  const form = new requestFormModule.CodexRequestForm(createQuestions())

  let result = form.applyKey('2', { name: '2' })
  assert.equal(result.kind, 'updated')

  result = form.applyKey('\n', { name: 'return' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.confirmUnansweredActive(), true)

  result = form.applyKey('\n', { name: 'return' })
  assert.equal(result.kind, 'submitted')
  assert.deepEqual(result.answers, {
    runtime: { answers: ['cloud'] },
    goal: { answers: [] },
  })
})

test('CodexRequestForm returns to the first unanswered question from confirmation overlay', () => {
  const form = new requestFormModule.CodexRequestForm(createQuestions())

  let result = form.applyKey('', { name: 'tab' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.currentState().header, 'Goal')

  for (const char of 'fill only the second question') {
    result = form.applyKey(char, { name: char })
    assert.equal(result.kind, 'updated')
  }

  result = form.applyKey('\n', { name: 'return' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.confirmUnansweredActive(), true)

  result = form.applyKey('', { name: 'escape' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.confirmUnansweredActive(), false)
  assert.equal(form.currentState().header, 'Runtime')
})

test('CodexRequestForm supports selecting Go back from the confirmation overlay', () => {
  const form = new requestFormModule.CodexRequestForm(createQuestions())

  let result = form.applyKey('', { name: 'tab' })
  assert.equal(result.kind, 'updated')

  for (const char of 'only second question answered') {
    result = form.applyKey(char, { name: char })
    assert.equal(result.kind, 'updated')
  }

  result = form.applyKey('\n', { name: 'return' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.confirmUnansweredActive(), true)

  result = form.applyKey('', { name: 'down' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.confirmationOverlayState()?.selectedIndex, 1)

  result = form.applyKey('\n', { name: 'return' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.confirmUnansweredActive(), false)
  assert.equal(form.currentState().header, 'Runtime')
})

test('CodexRequestForm preserves freeform drafts across question navigation until committed', () => {
  const form = new requestFormModule.CodexRequestForm(createThreeQuestions())

  let result = form.applyKey('\n', { name: 'return' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.currentState().header, 'Goal')

  for (const char of 'keep this draft') {
    result = form.applyKey(char, { name: char })
    assert.equal(result.kind, 'updated')
  }

  result = form.applyKey('', { name: 'tab' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.currentState().header, 'Priority')
  assert.equal(form.currentState().unansweredCount, 2)

  result = form.applyKey('', { name: 'pageup' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.currentState().header, 'Goal')
  assert.equal(form.currentState().answerValue, 'keep this draft')
  assert.equal(form.currentState().unansweredCount, 2)

  result = form.applyKey('\n', { name: 'return' })
  assert.equal(result.kind, 'updated')
  assert.equal(form.currentState().header, 'Priority')
  assert.equal(form.currentState().unansweredCount, 1)
})
