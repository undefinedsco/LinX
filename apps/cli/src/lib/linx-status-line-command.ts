import { Container, getKeybindings, Spacer, Text, truncateToWidth } from '@earendil-works/pi-tui'
import { showLinxInteractiveError } from './linx-interactive-error-display.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import {
  canChooseLinxInteractiveExtensionSelectorOption,
  chooseLinxInteractiveExtensionSelectorOption,
} from './linx-interactive-extension-selector-host.js'
import { canShowLinxInteractiveSelector, showLinxInteractiveSelector } from './linx-interactive-selector-host.js'
import {
  DEFAULT_STATUS_LINE_TOKENS,
  LINX_STATUS_LINE_TOKEN_NAMES,
  parseLinxStatusLineColorArg,
  parseLinxStatusLineTokenArgs,
  readLinxStatusLineConfig,
  resetLinxStatusLineConfig,
  writeLinxStatusLineConfigPatch,
  type LinxStatusLineToken,
} from './linx-status-line.js'

export { readLinxStatusLineConfig } from './linx-status-line.js'

const CODEX_STYLE_STATUS_LINE_TOKENS: LinxStatusLineToken[] = [
  'model-with-reasoning',
  'git-branch',
  'context-remaining',
  'total-input-tokens',
  'total-output-tokens',
  'current-dir',
]
const COMPACT_STATUS_LINE_TOKENS: LinxStatusLineToken[] = [
  'model-with-reasoning',
  'context-remaining',
  'current-dir',
]
const STATUS_LINE_CODEX_PRESET_OPTION = 'Preset: Codex-style'
const STATUS_LINE_COMPACT_PRESET_OPTION = 'Preset: Compact'
const STATUS_LINE_TOGGLE_COLORS_OPTION = 'Toggle colors'
const STATUS_LINE_RESET_OPTION = 'Reset to default'
const STATUS_LINE_DONE_OPTION = 'Done'

type InteractiveStatusLineShell = {
  showStatus?: (message: string) => void
  showError?: (message: string) => void
  footer?: { invalidate?: () => void }
  ui?: { requestRender?: () => void }
}

export async function handleInteractiveStatusLineCommand(
  interactive: InteractiveStatusLineShell,
  args: string[],
): Promise<void> {
  if (args.length > 0) {
    handleInteractiveStatusLineArgs(interactive, args)
    return
  }

  const summary = formatInteractiveStatusLineSummary()
  if (canShowLinxInteractiveSelector(interactive)) {
    await showInteractiveStatusLineMultiSelect(interactive)
    return
  }

  if (canChooseLinxInteractiveExtensionSelectorOption(interactive)) {
    await showInteractiveStatusLineFallbackSelector(interactive)
    return
  }

  showLinxInteractiveStatus(interactive, `${summary} · Use /statusline set <tokens...>, /statusline tokens, /statusline colors <on|off>, or /statusline reset.`)
}

async function showInteractiveStatusLineFallbackSelector(interactive: InteractiveStatusLineShell): Promise<void> {
  while (true) {
    const currentSummary = formatInteractiveStatusLineSummary()
    const config = readLinxStatusLineConfig()
    const options = buildInteractiveStatusLineOptions(config)
    const choice = await chooseLinxInteractiveExtensionSelectorOption(interactive, `Status line\n${currentSummary}`, options)

    if (!choice || choice === STATUS_LINE_DONE_OPTION) {
      return
    }

    const token = parseInteractiveStatusLineTokenChoice(choice)
    if (token) {
      toggleInteractiveStatusLineToken(interactive, token)
      continue
    }

    if (choice === STATUS_LINE_CODEX_PRESET_OPTION) {
      writeInteractiveStatusLineConfig(interactive, {
        statusLine: CODEX_STYLE_STATUS_LINE_TOKENS,
        message: 'Status line set to Codex-style preset.',
      })
      continue
    }
    if (choice === STATUS_LINE_COMPACT_PRESET_OPTION) {
      writeInteractiveStatusLineConfig(interactive, {
        statusLine: COMPACT_STATUS_LINE_TOKENS,
        message: 'Status line set to compact preset.',
      })
      continue
    }
    if (choice === STATUS_LINE_TOGGLE_COLORS_OPTION) {
      const current = readLinxStatusLineConfig()
      writeInteractiveStatusLineConfig(interactive, {
        statusLineUseColors: !current.useColors,
        message: `Status line colors ${current.useColors ? 'disabled' : 'enabled'}.`,
      })
      continue
    }
    if (choice === STATUS_LINE_RESET_OPTION) {
      resetLinxStatusLineConfig()
      finishInteractiveStatusLineUpdate(interactive, `Status line reset to default: ${DEFAULT_STATUS_LINE_TOKENS.join(', ')}`)
    }
  }
}

async function showInteractiveStatusLineMultiSelect(interactive: InteractiveStatusLineShell): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let resolved = false
    const resolveOnce = () => {
      if (!resolved) {
        resolved = true
        resolvePromise()
      }
    }

    try {
      showLinxInteractiveSelector(interactive, (done: () => void) => {
        const close = () => {
          done()
          resolveOnce()
        }
        const selector = new LinxStatusLineSelectorComponent(
          readLinxStatusLineConfig(),
          ({ tokens, useColors }) => {
            writeInteractiveStatusLineConfig(interactive, {
              statusLine: tokens,
              statusLineUseColors: useColors,
              message: `Status line updated: ${tokens.join(', ')}`,
            })
            close()
          },
          () => {
            close()
            showLinxInteractiveStatus(interactive, null)
          },
        )
        return { component: selector, focus: selector.getList() }
      })
    } catch (error) {
      rejectPromise(error)
    }
  })
}

function buildInteractiveStatusLineOptions(config = readLinxStatusLineConfig()): string[] {
  const enabled = new Set(config.tokens)
  return [
    ...LINX_STATUS_LINE_TOKEN_NAMES.map((token) => `${enabled.has(token) ? '✓' : '○'} ${token}`),
    STATUS_LINE_CODEX_PRESET_OPTION,
    STATUS_LINE_COMPACT_PRESET_OPTION,
    STATUS_LINE_TOGGLE_COLORS_OPTION,
    STATUS_LINE_RESET_OPTION,
    STATUS_LINE_DONE_OPTION,
  ]
}

function parseInteractiveStatusLineTokenChoice(choice: unknown): LinxStatusLineToken | null {
  if (typeof choice !== 'string') {
    return null
  }
  const token = choice.replace(/^[✓○]\s*/u, '').trim()
  if (!token) {
    return null
  }
  return LINX_STATUS_LINE_TOKEN_NAMES.includes(token as LinxStatusLineToken)
    ? token as LinxStatusLineToken
    : null
}

function toggleInteractiveStatusLineToken(interactive: InteractiveStatusLineShell, token: LinxStatusLineToken): void {
  const current = readLinxStatusLineConfig().tokens
  const exists = current.includes(token)
  if (exists && current.length <= 1) {
    showLinxInteractiveError(interactive, 'Status line needs at least one item.')
    return
  }

  const next = exists
    ? current.filter((item) => item !== token)
    : [...current, token]
  writeInteractiveStatusLineConfig(interactive, {
    statusLine: next,
    message: `Status line ${exists ? 'removed' : 'added'}: ${token}`,
  })
}

function handleInteractiveStatusLineArgs(interactive: InteractiveStatusLineShell, args: string[]): void {
  const action = args[0]?.toLowerCase()
  if (action === 'tokens' || action === 'list') {
    showInteractiveStatusLineTokens(interactive)
    return
  }
  if (action === 'reset') {
    resetLinxStatusLineConfig()
    finishInteractiveStatusLineUpdate(interactive, `Status line reset to default: ${DEFAULT_STATUS_LINE_TOKENS.join(', ')}`)
    return
  }
  if (action === 'colors' || action === 'color') {
    const value = parseLinxStatusLineColorArg(args[1])
    if (value === undefined) {
      showLinxInteractiveError(interactive, 'Usage: /statusline colors <on|off>')
      return
    }
    writeInteractiveStatusLineConfig(interactive, {
      statusLineUseColors: value,
      message: `Status line colors ${value ? 'enabled' : 'disabled'}.`,
    })
    return
  }

  const tokenArgs = action === 'set' ? args.slice(1) : args
  try {
    const tokens = parseLinxStatusLineTokenArgs(tokenArgs)
    writeInteractiveStatusLineConfig(interactive, {
      statusLine: tokens,
      message: `Status line updated: ${tokens.join(', ')}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showLinxInteractiveError(interactive, `${message}. Use /statusline tokens to list valid tokens.`)
  }
}

function writeInteractiveStatusLineConfig(
  interactive: InteractiveStatusLineShell,
  patch: {
    statusLine?: LinxStatusLineToken[]
    statusLineUseColors?: boolean
    message: string
  },
): void {
  writeLinxStatusLineConfigPatch({
    ...(patch.statusLine ? { statusLine: patch.statusLine } : {}),
    ...(patch.statusLineUseColors !== undefined ? { statusLineUseColors: patch.statusLineUseColors } : {}),
  })
  finishInteractiveStatusLineUpdate(interactive, patch.message)
}

function finishInteractiveStatusLineUpdate(interactive: InteractiveStatusLineShell, message: string): void {
  interactive.footer?.invalidate?.()
  showLinxInteractiveStatus(interactive, message)
}

function showInteractiveStatusLineTokens(interactive: InteractiveStatusLineShell): void {
  showLinxInteractiveStatus(interactive, `Status line tokens: ${LINX_STATUS_LINE_TOKEN_NAMES.join(', ')}`)
}

function formatInteractiveStatusLineSummary(): string {
  const config = readLinxStatusLineConfig()
  return `Current: ${config.tokens.join(', ')} · colors ${config.useColors ? 'on' : 'off'} · source ${config.tokenSource}`
}

type LinxMultiSelectRow =
  | {
    kind: 'item'
    id: string
    label: string
    selected: boolean
    description?: string
  }
  | {
    kind: 'action'
    id: string
    label: string
    description?: string
  }

class LinxMultiSelectList {
  private selectedIndex = 0

  constructor(
    private readonly getRows: () => LinxMultiSelectRow[],
    private readonly onToggle: (id: string) => void,
    private readonly onAction: (id: string) => void,
    private readonly onCancel: () => void,
  ) {}

  invalidate(): void {
    // No cached render state.
  }

  render(width: number): string[] {
    const rows = this.normalizedRows()
    if (rows.length === 0) {
      return ['  No options']
    }

    const lines: string[] = []
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const cursor = index === this.selectedIndex ? '> ' : '  '
      const label = row.kind === 'item'
        ? `${row.selected ? '✓' : '○'} ${row.label}`
        : row.label
      lines.push(`${cursor}${truncateToWidth(label, Math.max(1, width - 2))}`)
      if (row.description) {
        lines.push(`  ${truncateToWidth(row.description, Math.max(1, width - 2))}`)
      }
    }
    lines.push('')
    lines.push('↑↓ navigate  Enter toggles items/actions  Escape/Ctrl+C cancel')
    return lines
  }

  handleInput(keyData: string): void {
    const rows = this.normalizedRows()
    if (rows.length === 0) {
      return
    }

    const keybindings = getKeybindings()
    if (keybindings.matches(keyData, 'tui.select.up')) {
      this.selectedIndex = this.selectedIndex === 0 ? rows.length - 1 : this.selectedIndex - 1
      return
    }
    if (keybindings.matches(keyData, 'tui.select.down')) {
      this.selectedIndex = this.selectedIndex === rows.length - 1 ? 0 : this.selectedIndex + 1
      return
    }
    if (keybindings.matches(keyData, 'tui.select.confirm')) {
      const selected = rows[this.selectedIndex]
      if (selected?.kind === 'item') {
        this.onToggle(selected.id)
      } else if (selected?.kind === 'action') {
        this.onAction(selected.id)
      }
      return
    }
    if (keybindings.matches(keyData, 'tui.select.cancel')) {
      this.onCancel()
    }
  }

  private normalizedRows(): LinxMultiSelectRow[] {
    const rows = this.getRows()
    if (this.selectedIndex >= rows.length) {
      this.selectedIndex = Math.max(0, rows.length - 1)
    }
    return rows
  }
}

class LinxStatusLineSelectorComponent extends Container {
  private readonly list: LinxMultiSelectList
  private draftTokens: LinxStatusLineToken[]
  private draftUseColors: boolean
  private notice: string | null = null

  constructor(
    config: ReturnType<typeof readLinxStatusLineConfig>,
    onCommit: (config: { tokens: LinxStatusLineToken[]; useColors: boolean }) => void,
    onCancel: () => void,
  ) {
    super()
    this.draftTokens = [...config.tokens]
    this.draftUseColors = config.useColors

    this.addChild(new Spacer(1))
    this.addChild(new Text('Status line', 1, 0))
    this.addChild(new Text('Select the items that appear in the bottom TUI status line.', 1, 0))
    this.addChild(new Text(`Current source: tokens ${config.tokenSource}, colors ${config.colorSource}.`, 1, 0))
    this.addChild(new Spacer(1))
    this.list = new LinxMultiSelectList(
      () => this.rows(),
      (id) => this.toggleToken(id),
      (id) => this.handleAction(id, onCommit),
      onCancel,
    )
    this.addChild(this.list)
  }

  getList(): LinxMultiSelectList {
    return this.list
  }

  private rows(): LinxMultiSelectRow[] {
    const enabled = new Set(this.draftTokens)
    const rows: LinxMultiSelectRow[] = LINX_STATUS_LINE_TOKEN_NAMES.map((token) => ({
      kind: 'item',
      id: token,
      label: token,
      selected: enabled.has(token),
    }))
    rows.push(
      {
        kind: 'action',
        id: 'preset-codex',
        label: STATUS_LINE_CODEX_PRESET_OPTION,
        description: CODEX_STYLE_STATUS_LINE_TOKENS.join(', '),
      },
      {
        kind: 'action',
        id: 'preset-compact',
        label: STATUS_LINE_COMPACT_PRESET_OPTION,
        description: COMPACT_STATUS_LINE_TOKENS.join(', '),
      },
      {
        kind: 'action',
        id: 'toggle-colors',
        label: `${STATUS_LINE_TOGGLE_COLORS_OPTION}: ${this.draftUseColors ? 'on' : 'off'}`,
      },
      {
        kind: 'action',
        id: 'reset',
        label: STATUS_LINE_RESET_OPTION,
        description: DEFAULT_STATUS_LINE_TOKENS.join(', '),
      },
      {
        kind: 'action',
        id: 'done',
        label: STATUS_LINE_DONE_OPTION,
        description: this.notice ?? 'Save changes and close.',
      },
    )
    return rows
  }

  private toggleToken(id: string): void {
    const token = id as LinxStatusLineToken
    if (!LINX_STATUS_LINE_TOKEN_NAMES.includes(token)) {
      return
    }
    const exists = this.draftTokens.includes(token)
    if (exists && this.draftTokens.length <= 1) {
      this.notice = 'Status line needs at least one item.'
      return
    }
    this.draftTokens = exists
      ? this.draftTokens.filter((item) => item !== token)
      : [...this.draftTokens, token]
    this.notice = null
  }

  private handleAction(
    id: string,
    onCommit: (config: { tokens: LinxStatusLineToken[]; useColors: boolean }) => void,
  ): void {
    if (id === 'preset-codex') {
      this.draftTokens = [...CODEX_STYLE_STATUS_LINE_TOKENS]
      this.notice = 'Draft changed to Codex-style preset.'
      return
    }
    if (id === 'preset-compact') {
      this.draftTokens = [...COMPACT_STATUS_LINE_TOKENS]
      this.notice = 'Draft changed to compact preset.'
      return
    }
    if (id === 'toggle-colors') {
      this.draftUseColors = !this.draftUseColors
      this.notice = `Draft colors ${this.draftUseColors ? 'enabled' : 'disabled'}.`
      return
    }
    if (id === 'reset') {
      this.draftTokens = [...DEFAULT_STATUS_LINE_TOKENS]
      this.draftUseColors = true
      this.notice = 'Draft reset to default.'
      return
    }
    if (id === 'done') {
      onCommit({
        tokens: this.draftTokens,
        useColors: this.draftUseColors,
      })
    }
  }
}
