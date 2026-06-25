import { handleInteractiveRewindSelector } from './linx-rewind-command.js'
import { showLinxInteractiveError } from './linx-interactive-error-display.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import { getLinxInteractiveEditorText } from './linx-interactive-editor-text-host.js'
import { getLinxInteractiveDefaultEditorComponent } from './linx-editor-component-router.js'
import { getLinxInteractiveRuntime } from './linx-interactive-runtime-host.js'
import { isLinxInteractiveAutoModeEnabled } from './linx-interactive-shell-state.js'
import { stopLinxInteractiveSessionWorkNow } from './linx-session-work-control.js'
import {
  isClearInterruptInstalled,
  isEscapeInterruptInstalled,
  isEscapeInterruptWrapper,
  markClearInterruptInstalled,
  markEscapeInterruptInstalled,
  markEscapeInterruptWrapper,
} from './linx-interrupt-control-host.js'

export interface LinxInterruptControlOptions {
  disableAutoMode?: (interactive: any) => void | Promise<void>
}

export function installLinxEscapeInterrupt(
  interactive: any,
  options: LinxInterruptControlOptions = {},
): void {
  const editor = getLinxInteractiveDefaultEditorComponent(interactive)
  if (!editor || isEscapeInterruptInstalled(editor)) {
    return
  }

  const initialOnEscape = typeof editor.onEscape === 'function'
    ? editor.onEscape
    : undefined
  let currentOnEscape = isEscapeInterruptWrapper(initialOnEscape)
    ? undefined
    : initialOnEscape
  let lastIdleEscapeTime = 0

  const linxEscapeInterrupt = function linxEscapeInterrupt(): void {
    if (handBackAutoControlOnInterrupt(interactive, options)) {
      lastIdleEscapeTime = 0
      return
    }

    if (stopLinxInteractiveSessionWorkNow(interactive)) {
      lastIdleEscapeTime = 0
      return
    }

    if (shouldHandleLinxIdleDoubleEscape(interactive)) {
      const now = Date.now()
      if (now - lastIdleEscapeTime < 500) {
        lastIdleEscapeTime = 0
        void openInteractiveRewindFromEscape(interactive)
      } else {
        lastIdleEscapeTime = now
        showLinxInteractiveStatus(interactive, 'Press Escape again to rewind this session.')
      }
      return
    }

    lastIdleEscapeTime = 0
    currentOnEscape?.call(editor)
  }
  markEscapeInterruptWrapper(linxEscapeInterrupt)

  Object.defineProperty(editor, 'onEscape', {
    configurable: true,
    get() {
      return linxEscapeInterrupt
    },
    set(next: unknown) {
      if (isEscapeInterruptWrapper(next)) {
        return
      }
      currentOnEscape = typeof next === 'function' ? next : undefined
    },
  })

  installLinxClearInterrupt(interactive, editor, options)
  markEscapeInterruptInstalled(editor)
}

function shouldHandleLinxIdleDoubleEscape(interactive: any): boolean {
  const text = getLinxInteractiveEditorText(interactive)
  return typeof text === 'string' && text.trim().length === 0
}

async function openInteractiveRewindFromEscape(interactive: any): Promise<void> {
  try {
    await handleInteractiveRewindSelector(interactive, getLinxInteractiveRuntime(interactive))
  } catch (error) {
    showLinxInteractiveError(interactive, error instanceof Error ? error.message : String(error))
  }
}

function installLinxClearInterrupt(interactive: any, editor: any, options: LinxInterruptControlOptions): void {
  const handlers = editor?.actionHandlers
  if (!(handlers instanceof Map) || isClearInterruptInstalled(editor)) {
    return
  }

  const originalClear = handlers.get('app.clear')
  handlers.set('app.clear', () => {
    if (handBackAutoControlOnInterrupt(interactive, options)) {
      return
    }
    originalClear?.call(editor)
  })
  markClearInterruptInstalled(editor)
}

function handBackAutoControlOnInterrupt(interactive: any, options: LinxInterruptControlOptions): boolean {
  if (!isLinxInteractiveAutoModeEnabled(interactive, getLinxInteractiveRuntime(interactive))) {
    return false
  }

  stopLinxInteractiveSessionWorkNow(interactive)
  void options.disableAutoMode?.(interactive)
  return true
}
