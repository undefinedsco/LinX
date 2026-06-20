import { handleInteractiveRewindSelector } from './linx-rewind-command.js'

export interface LinxInterruptControlOptions {
  disableAutoMode?: (interactive: any) => void | Promise<void>
}

export function installLinxEscapeInterrupt(
  interactive: any,
  options: LinxInterruptControlOptions = {},
): void {
  const editor = interactive?.defaultEditor
  if (!editor || editor.__linxEscapeInterruptInstalled) {
    return
  }

  const initialOnEscape = typeof editor.onEscape === 'function'
    ? editor.onEscape
    : undefined
  let currentOnEscape = isLinxEscapeInterruptWrapper(initialOnEscape)
    ? undefined
    : initialOnEscape
  let lastIdleEscapeTime = 0

  const linxEscapeInterrupt = function linxEscapeInterrupt(): void {
    const session = interactive?.session

    if (handBackAutoControlOnInterrupt(interactive, options)) {
      lastIdleEscapeTime = 0
      return
    }

    if (session?.isBashRunning && typeof session.abortBash === 'function') {
      lastIdleEscapeTime = 0
      void session.abortBash()
      return
    }

    if (isLinxSessionRunning(interactive) && typeof session?.abort === 'function') {
      lastIdleEscapeTime = 0
      void session.abort()
      return
    }

    if (shouldHandleLinxIdleDoubleEscape(interactive)) {
      const now = Date.now()
      if (now - lastIdleEscapeTime < 500) {
        lastIdleEscapeTime = 0
        void openInteractiveRewindFromEscape(interactive)
      } else {
        lastIdleEscapeTime = now
        interactive?.showStatus?.('Press Escape again to rewind this session.')
        interactive?.ui?.requestRender?.()
      }
      return
    }

    lastIdleEscapeTime = 0
    currentOnEscape?.call(editor)
  }
  Object.defineProperty(linxEscapeInterrupt, '__linxEscapeInterruptWrapper', {
    value: true,
  })

  Object.defineProperty(editor, 'onEscape', {
    configurable: true,
    get() {
      return linxEscapeInterrupt
    },
    set(next: unknown) {
      if (isLinxEscapeInterruptWrapper(next)) {
        return
      }
      currentOnEscape = typeof next === 'function' ? next : undefined
    },
  })

  installLinxClearInterrupt(interactive, editor, options)
  editor.__linxEscapeInterruptInstalled = true
}

function shouldHandleLinxIdleDoubleEscape(interactive: any): boolean {
  if (typeof interactive?.editor?.getText !== 'function') {
    return false
  }
  const text = String(interactive.editor.getText() ?? '')
  return text.trim().length === 0
}

async function openInteractiveRewindFromEscape(interactive: any): Promise<void> {
  try {
    await handleInteractiveRewindSelector(interactive, interactive?.runtime)
  } catch (error) {
    interactive?.showError?.(error instanceof Error ? error.message : String(error))
  }
}

function isLinxEscapeInterruptWrapper(value: unknown): boolean {
  return typeof value === 'function'
    && (value as { __linxEscapeInterruptWrapper?: unknown }).__linxEscapeInterruptWrapper === true
}

function installLinxClearInterrupt(interactive: any, editor: any, options: LinxInterruptControlOptions): void {
  const handlers = editor?.actionHandlers
  if (!(handlers instanceof Map) || editor.__linxClearInterruptInstalled) {
    return
  }

  const originalClear = handlers.get('app.clear')
  handlers.set('app.clear', () => {
    if (handBackAutoControlOnInterrupt(interactive, options)) {
      return
    }
    originalClear?.call(editor)
  })
  editor.__linxClearInterruptInstalled = true
}

function handBackAutoControlOnInterrupt(interactive: any, options: LinxInterruptControlOptions): boolean {
  if (interactive?.__autoEnabled !== true) {
    return false
  }

  const session = interactive?.session
  if (session?.isBashRunning && typeof session.abortBash === 'function') {
    void session.abortBash()
  } else if (isLinxSessionRunning(interactive) && typeof session?.abort === 'function') {
    void session.abort()
  }

  void options.disableAutoMode?.(interactive)
  return true
}

function isLinxSessionRunning(interactive: any): boolean {
  return interactive?.session?.isStreaming === true
    || Boolean(interactive?.loadingAnimation)
    || Boolean(interactive?.autoCompactionEscapeHandler)
    || Boolean(interactive?.retryEscapeHandler)
}
