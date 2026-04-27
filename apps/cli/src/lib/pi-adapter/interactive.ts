import { InteractiveMode } from '@mariozechner/pi-coding-agent'
import { FooterComponent } from '@mariozechner/pi-coding-agent'
import { applyLinxInteractiveBranding } from './branding.js'

export interface PiInteractiveBootstrap {
  init(): Promise<void>
  run(): Promise<void>
  stop(): void
}

let footerPatched = false

export function bootstrapPiInteractiveMode(runtime: any): PiInteractiveBootstrap {
  patchPiFooter()
  const interactive = new InteractiveMode(runtime, {})
  applyLinxInteractiveBranding(interactive as any)
  patchInteractiveExitMessage(interactive as any)

  return {
    async init(): Promise<void> {
      await interactive.init()
    },
    async run(): Promise<void> {
      await interactive.run()
    },
    stop(): void {
      interactive.stop()
    },
  }
}

function patchInteractiveExitMessage(interactive: any): void {
  const originalInit = interactive.init?.bind(interactive)
  const originalStop = interactive.stop?.bind(interactive)
  let initialized = false
  let exitMessageWritten = false

  if (typeof originalInit === 'function') {
    interactive.init = async function patchedInit(...args: unknown[]): Promise<unknown> {
      const result = await originalInit(...args)
      initialized = true
      return result
    }
  }

  if (typeof originalStop !== 'function') {
    return
  }

  interactive.stop = function patchedStop(...args: unknown[]): void {
    originalStop(...args)
    if (!initialized || exitMessageWritten || process.env.LINX_TUI_NO_EXIT_MESSAGE === '1') {
      return
    }
    exitMessageWritten = true
    if (process.stdout.isTTY) {
      process.stdout.write('\nLinX session closed.\n')
    }
  }
}

function patchPiFooter(): void {
  if (footerPatched) {
    return
  }

  const originalRender = FooterComponent.prototype.render
  FooterComponent.prototype.render = function patchedRender(width: number): string[] {
    const lines = originalRender.call(this, width)
    if (Array.isArray(lines) && lines.length > 1 && typeof lines[1] === 'string') {
      lines[1] = lines[1].replace(/\$0\.000 \(sub\)\s*/g, '')
      lines[1] = lines[1].replace(/\(undefineds\)\s+/g, '')
    }
    return lines
  }
  footerPatched = true
}
