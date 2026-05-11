// Directly inspired by codex-rs/tui/src/bottom_pane/request_user_input/*.
// This keeps multi-question request-user-input state in one place instead of
// spreading question navigation across runner and display.

import {
  resolveWatchQuestionAnswer,
  type WatchUserInputAnswers,
  type WatchUserInputQuestion,
} from '@undefineds.co/models/watch'
import { CodexComposer } from './codex-composer.js'
import type { CodexOverlayState } from './codex-overlay.js'
import type { CodexRequestInputState } from './codex-request-input.js'

interface RequestQuestionDraft {
  selectedIndex: number
  answerCommitted: boolean
  answerValue: string
  answerCursor: number
}

type FormActionResult =
  | { kind: 'updated' }
  | { kind: 'submitted'; answers: WatchUserInputAnswers }

const UNANSWERED_CONFIRM_TITLE = 'Submit with unanswered questions?'
const UNANSWERED_CONFIRM_SUBMIT = 'Proceed'
const UNANSWERED_CONFIRM_GO_BACK = 'Go back'

function defaultDraft(question: WatchUserInputQuestion): RequestQuestionDraft {
  return {
    selectedIndex: 0,
    answerCommitted: false,
    answerValue: '',
    answerCursor: 0,
  }
}

function footerHint(question: WatchUserInputQuestion, index: number, count: number): string {
  const submitHint = index === count - 1 ? 'Enter submit' : 'Enter next'
  if (question.options.length > 0) {
    const questionHint = count > 1 ? 'h/l question' : null
    return [
      '↑/↓ move',
      submitHint,
      questionHint,
      '1-9 select',
    ]
      .filter((part): part is string => Boolean(part))
      .join(' | ')
  }

  return [
    submitHint,
    count > 1 ? 'Tab next' : null,
    count > 1 ? 'Ctrl+P/Ctrl+N question' : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' | ')
}

function unansweredSubmitDescription(count: number): string {
  return `Submit with ${count} unanswered question${count === 1 ? '' : 's'}.`
}

export class CodexRequestForm {
  private readonly drafts: RequestQuestionDraft[]
  private questionIndex = 0
  private confirmUnansweredSelectedIndex: number | null = null

  constructor(private readonly questions: WatchUserInputQuestion[]) {
    this.drafts = questions.map((question) => defaultDraft(question))
  }

  currentQuestionIndex(): number {
    return this.questionIndex
  }

  questionCount(): number {
    return this.questions.length
  }

  confirmUnansweredActive(): boolean {
    return this.confirmUnansweredSelectedIndex !== null
  }

  confirmationOverlayState(): CodexOverlayState | null {
    if (!this.confirmUnansweredActive()) {
      return null
    }

    const unanswered = this.unansweredCount()

    return {
      title: UNANSWERED_CONFIRM_TITLE,
      body: [`${unanswered} unanswered question${unanswered === 1 ? '' : 's'}`],
      options: [
        {
          label: UNANSWERED_CONFIRM_SUBMIT,
          value: 'submit',
          description: unansweredSubmitDescription(unanswered),
          shortcuts: ['1'],
        },
        {
          label: UNANSWERED_CONFIRM_GO_BACK,
          value: 'back',
          description: 'Return to the first unanswered question.',
          shortcuts: ['2'],
        },
      ],
      selectedIndex: this.confirmUnansweredSelectedIndex ?? 0,
      footerHint: '↑/↓ move | Enter confirm | Esc go back | 1-2 select',
    }
  }

  unansweredCount(): number {
    return this.questions.reduce((count, question, index) => (
      count + (this.isQuestionAnswered(index, question) ? 0 : 1)
    ), 0)
  }

  currentState(): CodexRequestInputState {
    const question = this.questions[this.questionIndex]
    const draft = this.drafts[this.questionIndex]
    return {
      header: question?.header ?? 'Question',
      question: question?.question ?? '',
      options: (question?.options ?? []).map((option, index) => ({
        label: option.label,
        value: option.label,
        description: option.description,
        shortcuts: [`${index + 1}`],
      })),
      selectedIndex: draft?.selectedIndex ?? 0,
      questionIndex: this.questionIndex,
      questionCount: this.questions.length,
      unansweredCount: this.unansweredCount(),
      answerValue: draft?.answerValue ?? '',
      answerCursor: draft?.answerCursor ?? 0,
      footerHint: question ? footerHint(question, this.questionIndex, this.questions.length) : undefined,
    }
  }

  applyKey(value: string, key: { name?: string; ctrl?: boolean; meta?: boolean }): FormActionResult {
    if (this.confirmUnansweredActive()) {
      return this.applyConfirmKey(value, key)
    }

    const question = this.questions[this.questionIndex]
    if (!question) {
      return {
        kind: 'submitted',
        answers: this.buildAnswers(),
      }
    }

    if (question.options.length > 0) {
      return this.applyOptionKey(value, key, question)
    }

    return this.applyFreeformKey(value, key)
  }

  private applyOptionKey(
    value: string,
    key: { name?: string; ctrl?: boolean; meta?: boolean },
    question: WatchUserInputQuestion,
  ): FormActionResult {
    const draft = this.drafts[this.questionIndex]
    if (!draft) {
      return { kind: 'updated' }
    }

    const shortcut = typeof value === 'string' ? value.toLowerCase() : ''
    if (/^[1-9]$/u.test(shortcut)) {
      const optionIndex = Number(shortcut) - 1
      if (optionIndex < question.options.length) {
        draft.selectedIndex = optionIndex
        draft.answerCommitted = true
        return this.advanceOrSubmit()
      }
    }

    if (key.name === 'up' || key.name === 'k') {
      const nextIndex = Math.max(0, draft.selectedIndex - 1)
      if (nextIndex !== draft.selectedIndex) {
        draft.selectedIndex = nextIndex
        draft.answerCommitted = false
      }
      return { kind: 'updated' }
    }

    if (key.name === 'down' || key.name === 'j') {
      const nextIndex = Math.min(question.options.length - 1, draft.selectedIndex + 1)
      if (nextIndex !== draft.selectedIndex) {
        draft.selectedIndex = nextIndex
        draft.answerCommitted = false
      }
      return { kind: 'updated' }
    }

    if (key.name === 'left' || key.name === 'h' || (key.ctrl && key.name === 'p') || key.name === 'pageup') {
      this.moveQuestion(-1)
      return { kind: 'updated' }
    }

    if (key.name === 'right' || key.name === 'l' || key.name === 'tab' || (key.ctrl && key.name === 'n') || key.name === 'pagedown') {
      this.moveQuestion(1)
      return { kind: 'updated' }
    }

    if (key.name === 'return' || key.name === 'enter') {
      draft.answerCommitted = true
      return this.advanceOrSubmit()
    }

    return { kind: 'updated' }
  }

  private applyFreeformKey(
    value: string,
    key: { name?: string; ctrl?: boolean; meta?: boolean },
  ): FormActionResult {
    const draft = this.drafts[this.questionIndex]
    if (!draft) {
      return { kind: 'updated' }
    }

    if ((key.ctrl && key.name === 'p') || key.name === 'pageup') {
      this.moveQuestion(-1)
      return { kind: 'updated' }
    }

    if ((key.ctrl && key.name === 'n') || key.name === 'pagedown' || key.name === 'tab') {
      this.moveQuestion(1)
      return { kind: 'updated' }
    }

    const composer = new CodexComposer()
    composer.beginPrompt('answer> ')
    composer.setText(draft.answerValue, draft.answerCursor)

    if (key.name === 'return' || key.name === 'enter') {
      draft.answerCommitted = draft.answerValue.trim().length > 0
      return this.advanceOrSubmit()
    }

    let changed = false
    if (key.name === 'backspace') {
      composer.backspace()
      changed = true
    } else if (key.name === 'delete') {
      composer.deleteForward()
      changed = true
    } else if (key.name === 'left' || (key.ctrl && key.name === 'b')) {
      composer.moveLeft()
    } else if (key.name === 'right' || (key.ctrl && key.name === 'f')) {
      composer.moveRight()
    } else if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
      composer.moveToStart()
    } else if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
      composer.moveToEnd()
    } else if (key.ctrl && key.name === 'u') {
      composer.deleteToStart()
      changed = true
    } else if (key.ctrl && key.name === 'k') {
      composer.deleteToEnd()
      changed = true
    } else if (key.name === 'escape') {
      return { kind: 'updated' }
    } else if (typeof value === 'string' && value.length > 0 && !key.ctrl && !key.meta) {
      composer.insert(value)
      changed = true
    } else {
      return { kind: 'updated' }
    }

    draft.answerValue = composer.text()
    draft.answerCursor = composer.cursorIndex()
    if (changed) {
      draft.answerCommitted = false
    }
    return { kind: 'updated' }
  }

  private advanceOrSubmit(): FormActionResult {
    if (this.questionIndex < this.questions.length - 1) {
      this.questionIndex += 1
      return { kind: 'updated' }
    }

    if (this.unansweredCount() > 0) {
      this.openConfirmUnanswered()
      return { kind: 'updated' }
    }

    return {
      kind: 'submitted',
      answers: this.buildAnswers(),
    }
  }

  private applyConfirmKey(
    value: string,
    key: { name?: string; ctrl?: boolean; meta?: boolean },
  ): FormActionResult {
    if (key.name === 'escape' || key.name === 'backspace') {
      this.closeConfirmUnanswered()
      this.jumpToFirstUnanswered()
      return { kind: 'updated' }
    }

    const shortcut = typeof value === 'string' ? value : ''
    if (shortcut === '1') {
      this.confirmUnansweredSelectedIndex = 0
      return { kind: 'updated' }
    }

    if (shortcut === '2') {
      this.confirmUnansweredSelectedIndex = 1
      return { kind: 'updated' }
    }

    if (key.name === 'up' || key.name === 'k') {
      this.confirmUnansweredSelectedIndex = 0
      return { kind: 'updated' }
    }

    if (key.name === 'down' || key.name === 'j') {
      this.confirmUnansweredSelectedIndex = 1
      return { kind: 'updated' }
    }

    if (key.name === 'return' || key.name === 'enter') {
      const selectedIndex = this.confirmUnansweredSelectedIndex ?? 0
      this.closeConfirmUnanswered()
      if (selectedIndex === 0) {
        return {
          kind: 'submitted',
          answers: this.buildAnswers(),
        }
      }

      this.jumpToFirstUnanswered()
      return { kind: 'updated' }
    }

    return { kind: 'updated' }
  }

  private moveQuestion(direction: -1 | 1): void {
    this.questionIndex = Math.max(0, Math.min(this.questions.length - 1, this.questionIndex + direction))
  }

  private openConfirmUnanswered(): void {
    this.confirmUnansweredSelectedIndex = 0
  }

  private closeConfirmUnanswered(): void {
    this.confirmUnansweredSelectedIndex = null
  }

  private firstUnansweredIndex(): number | null {
    for (const [index, question] of this.questions.entries()) {
      if (!this.isQuestionAnswered(index, question)) {
        return index
      }
    }

    return null
  }

  private jumpToFirstUnanswered(): void {
    const unansweredIndex = this.firstUnansweredIndex()
    if (unansweredIndex !== null) {
      this.questionIndex = unansweredIndex
    }
  }

  private isQuestionAnswered(index: number, question: WatchUserInputQuestion): boolean {
    const draft = this.drafts[index]
    if (!draft?.answerCommitted) {
      return false
    }

    if (question.options.length > 0) {
      return Boolean(question.options[draft.selectedIndex]?.label)
    }

    return draft.answerValue.trim().length > 0
  }

  private buildAnswers(): WatchUserInputAnswers {
    return this.questions.reduce<WatchUserInputAnswers>((record, question, index) => {
      record[question.id] = {
        answers: this.answersForQuestion(index, question),
      }
      return record
    }, {})
  }

  private answersForQuestion(index: number, question: WatchUserInputQuestion): string[] {
    const draft = this.drafts[index]
    if (!draft) {
      return []
    }

    if (!draft.answerCommitted) {
      return []
    }

    const raw = question.options.length > 0
      ? (question.options[draft.selectedIndex]?.label ?? '')
      : draft.answerValue

    return resolveWatchQuestionAnswer(question, raw)
  }
}
