export type LinxInteractiveSubmitContext = {
  interactive: any
  text: string
  input: string
  originalSubmit: (text: string) => Promise<void> | void
}

export type LinxInteractiveSubmitHandler = (
  context: LinxInteractiveSubmitContext
) => Promise<boolean> | boolean

type LinxInteractiveSubmitHandlerEntry = {
  name: string
  priority: number
  handler: LinxInteractiveSubmitHandler
}

type LinxInteractiveSubmitRouterState = {
  installed: boolean
  handlers: LinxInteractiveSubmitHandlerEntry[]
}

const LINX_INTERACTIVE_SUBMIT_ROUTER = Symbol.for('linx.tui.submitRouter')
const LINX_INTERACTIVE_SUBMIT_WRAPPED = Symbol.for('linx.tui.submitRouter.wrapped')

export function registerLinxInteractiveSubmitHandler(
  interactive: any,
  entry: LinxInteractiveSubmitHandlerEntry,
): void {
  const state = getLinxInteractiveSubmitRouterState(interactive)
  if (state.handlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.handlers.push(entry)
  state.handlers.sort((left, right) => left.priority - right.priority)
  installLinxInteractiveSubmitRouter(interactive, state)
}

function getLinxInteractiveSubmitRouterState(interactive: any): LinxInteractiveSubmitRouterState {
  if (!interactive || typeof interactive !== 'object') {
    return { installed: true, handlers: [] }
  }

  const existing = interactive[LINX_INTERACTIVE_SUBMIT_ROUTER]
  if (existing && typeof existing === 'object' && Array.isArray(existing.handlers)) {
    return existing as LinxInteractiveSubmitRouterState
  }

  const state: LinxInteractiveSubmitRouterState = {
    installed: false,
    handlers: [],
  }
  interactive[LINX_INTERACTIVE_SUBMIT_ROUTER] = state
  return state
}

function installLinxInteractiveSubmitRouter(
  interactive: any,
  state: LinxInteractiveSubmitRouterState,
): void {
  if (state.installed) {
    return
  }

  const originalSetup = interactive?.setupEditorSubmitHandler?.bind(interactive)
  if (typeof originalSetup !== 'function') {
    return
  }

  interactive.setupEditorSubmitHandler = function patchedLinxInteractiveSubmitRouter(...args: unknown[]): unknown {
    const result = originalSetup(...args)
    wrapLinxInteractiveEditorSubmit(this, state)
    return result
  }
  state.installed = true
}

function wrapLinxInteractiveEditorSubmit(
  interactive: any,
  state: LinxInteractiveSubmitRouterState,
): void {
  const editor = interactive?.defaultEditor
  const originalSubmit = editor?.onSubmit?.bind(editor)
  if (typeof originalSubmit !== 'function') {
    return
  }
  if ((editor.onSubmit as { [LINX_INTERACTIVE_SUBMIT_WRAPPED]?: boolean })[LINX_INTERACTIVE_SUBMIT_WRAPPED]) {
    return
  }

  const wrappedSubmit = async (text: string): Promise<void> => {
    const input = String(text ?? '').trim()
    const submitOriginal = async (submittedText: string): Promise<void> => {
      await originalSubmit(submittedText)
    }
    for (const entry of state.handlers) {
      if (await entry.handler({ interactive, text, input, originalSubmit: submitOriginal })) {
        return
      }
    }

    await submitOriginal(text)
  }
  ;(wrappedSubmit as { [LINX_INTERACTIVE_SUBMIT_WRAPPED]?: boolean })[LINX_INTERACTIVE_SUBMIT_WRAPPED] = true
  editor.onSubmit = wrappedSubmit
}
