import { FooterComponent } from '@earendil-works/pi-coding-agent'
import { visibleWidth } from '@earendil-works/pi-tui'
import { buildLinxFooterStatusLine } from './linx-status-line.js'

let footerPatched = false
let footerInteractive: any = null

export function setLinxFooterInteractive(interactive: any): void {
  footerInteractive = interactive ?? null
}

export function installLinxFooterPatch(): void {
  if (footerPatched) {
    return
  }

  const originalRender = FooterComponent.prototype.render
  FooterComponent.prototype.render = function patchedRender(width: number): string[] {
    const lines = originalRender.call(this, width)
    if (Array.isArray(lines) && lines.length > 1 && typeof lines[1] === 'string') {
      const session = (this as unknown as { session?: unknown }).session
      const autoCompactEnabled = (this as unknown as { autoCompactEnabled?: boolean }).autoCompactEnabled !== false
      const footerData = (this as unknown as { footerData?: unknown }).footerData
      const modePrefix = buildLinxFooterModePrefix()
      const modeLen = visibleWidth(modePrefix)
      const bulletLen = modeLen > 0 ? 3 : 0
      const statusWidth = Math.max(0, width - modeLen - bulletLen)
      lines[1] = buildLinxFooterStatusLine({
        session,
        width: statusWidth,
        autoCompactEnabled,
        footerData: footerData as Parameters<typeof buildLinxFooterStatusLine>[0]['footerData'],
      })
      if (modePrefix) {
        lines[1] = modePrefix + ' • ' + lines[1]
      }
    }
    return lines
  }
  footerPatched = true
}

export function buildLinxFooterModePrefix(): string {
  if (!footerInteractive) return ''
  const autoOn = footerInteractive.__autoEnabled === true
  const symphonyOn = footerInteractive.__linxSymphonyModeEnabled === true
  if (!autoOn && !symphonyOn) return ''
  if (autoOn && symphonyOn) return 'Symphony · Auto'
  if (autoOn) return 'Auto'
  return 'Symphony'
}
