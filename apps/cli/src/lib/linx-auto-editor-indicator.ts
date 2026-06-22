import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'
import { isLinxInteractiveAutoModeEnabled } from './linx-interactive-shell-state.js'
import {
  isAutoEditorIndicatorInstalled,
  isAutoEditorIndicatorRenderInstalled,
  markAutoEditorIndicatorInstalled,
  markAutoEditorIndicatorRenderInstalled,
} from './linx-auto-editor-indicator-host.js'
import { registerLinxEditorComponentRebindHandler } from './linx-editor-component-router.js'

const AUTO_EDITOR_INDICATOR_LABEL = ' 托管中 · Secretary 自动输入 · Ctrl+C 接管 · /auto off '

export function installLinxAutoEditorIndicator(interactive: any): void {
  if (!interactive || isAutoEditorIndicatorInstalled(interactive)) {
    return
  }

  decorateLinxAutoEditorRender(interactive.defaultEditor, interactive)
  if (interactive.editor && interactive.editor !== interactive.defaultEditor) {
    decorateLinxAutoEditorRender(interactive.editor, interactive)
  }

  registerLinxEditorComponentRebindHandler(interactive, {
    name: 'linx-auto-editor-indicator:decorate-editor-render',
    priority: 10,
    handler({ interactive: reboundInteractive }) {
      decorateLinxAutoEditorRender(reboundInteractive.defaultEditor, reboundInteractive)
      if (reboundInteractive.editor && reboundInteractive.editor !== reboundInteractive.defaultEditor) {
        decorateLinxAutoEditorRender(reboundInteractive.editor, reboundInteractive)
      }
    },
  })

  markAutoEditorIndicatorInstalled(interactive)
}

export function buildLinxAutoEditorIndicatorLine(width: number): string {
  if (width <= 0) {
    return ''
  }

  const fitted = truncateToWidth(AUTO_EDITOR_INDICATOR_LABEL, width)
  const padded = fitted + ' '.repeat(Math.max(0, width - visibleWidth(fitted)))
  return `\x1b[1m\x1b[38;5;230m\x1b[48;5;58m${padded}\x1b[0m`
}

function decorateLinxAutoEditorRender(editor: any, interactive: any): void {
  if (!editor || isAutoEditorIndicatorRenderInstalled(editor) || typeof editor.render !== 'function') {
    return
  }

  const originalRender = editor.render.bind(editor)
  editor.render = function linxAutoEditorIndicatorRender(width: number): string[] {
    const lines = originalRender(width)
    if (!isLinxInteractiveAutoModeEnabled(interactive)) {
      return lines
    }
    return decorateLinxAutoEditorLines(lines, width)
  }
  markAutoEditorIndicatorRenderInstalled(editor)
}

function decorateLinxAutoEditorLines(lines: string[], width: number): string[] {
  const rendered = Array.isArray(lines) ? [...lines] : []
  const indicator = buildLinxAutoEditorIndicatorLine(width)
  if (rendered.length === 0) {
    return [indicator]
  }
  rendered[0] = indicator
  return rendered
}
