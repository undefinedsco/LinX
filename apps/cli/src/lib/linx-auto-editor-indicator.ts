import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

const AUTO_EDITOR_INDICATOR_LABEL = ' 托管中 · Secretary 自动输入 · Ctrl+C 接管 · /auto off '

export function installLinxAutoEditorIndicator(interactive: any): void {
  if (!interactive || interactive.__linxAutoEditorIndicatorInstalled) {
    return
  }

  decorateLinxAutoEditorRender(interactive.defaultEditor, interactive)
  if (interactive.editor && interactive.editor !== interactive.defaultEditor) {
    decorateLinxAutoEditorRender(interactive.editor, interactive)
  }

  const originalSetCustomEditorComponent = interactive.setCustomEditorComponent?.bind(interactive)
  if (typeof originalSetCustomEditorComponent === 'function') {
    interactive.setCustomEditorComponent = function patchedSetCustomEditorComponent(...args: unknown[]): unknown {
      const result = originalSetCustomEditorComponent(...args)
      decorateLinxAutoEditorRender(this.defaultEditor, this)
      if (this.editor && this.editor !== this.defaultEditor) {
        decorateLinxAutoEditorRender(this.editor, this)
      }
      return result
    }
  }

  interactive.__linxAutoEditorIndicatorInstalled = true
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
  if (!editor || editor.__linxAutoEditorIndicatorRenderInstalled || typeof editor.render !== 'function') {
    return
  }

  const originalRender = editor.render.bind(editor)
  editor.render = function linxAutoEditorIndicatorRender(width: number): string[] {
    const lines = originalRender(width)
    if (interactive.__autoEnabled !== true) {
      return lines
    }
    return decorateLinxAutoEditorLines(lines, width)
  }
  editor.__linxAutoEditorIndicatorRenderInstalled = true
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
