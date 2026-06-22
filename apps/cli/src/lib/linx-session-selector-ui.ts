import { SessionSelectorComponent, initTheme, SettingsManager } from '@earendil-works/pi-coding-agent'
import { ProcessTerminal, TUI } from '@earendil-works/pi-tui'
import { LINX_AGENT_DIR } from './linx-interactive-branding.js'
import { listLinxPiSessions } from './linx-session-manager.js'

export async function selectLinxPiSession(cwd: string, sessionDir?: string): Promise<string | null> {
  const settingsManager = SettingsManager.create(cwd, LINX_AGENT_DIR)
  initTheme(settingsManager.getTheme())

  return new Promise((resolve) => {
    const ui = new TUI(new ProcessTerminal())
    let resolved = false
    const finish = (sessionPath: string | null): void => {
      if (resolved) {
        return
      }
      resolved = true
      ui.stop()
      resolve(sessionPath)
    }
    const loadSessions = () => listLinxPiSessions(cwd, LINX_AGENT_DIR, {
      sessionDir,
      podSessionSource: null,
    })
    const selector = new SessionSelectorComponent(
      loadSessions,
      loadSessions,
      (sessionPath) => finish(sessionPath),
      () => finish(null),
      () => {
        ui.stop()
        process.exit(0)
      },
      () => ui.requestRender(),
      { showRenameHint: false },
    )
    ui.addChild(selector)
    ui.setFocus(selector.getSessionList())
    ui.start()
  })
}
