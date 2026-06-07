export const LINX_TUI_KEYMAP_COMMAND = '/hotkeys'
export const LINX_TUI_KEYMAP_LABEL = 'keymap'
export const LINX_TUI_EXIT_COMMAND = '/exit'
export const LINX_TUI_LOGIN_COMMAND = '/login'
export const LINX_TUI_LOGOUT_COMMAND = '/logout'

export const LINX_TUI_READY_STATUS_HINT = `enter send | ${LINX_TUI_KEYMAP_COMMAND} ${LINX_TUI_KEYMAP_LABEL} | ${LINX_TUI_EXIT_COMMAND}`
export const LINX_TUI_READY_FOOTER_HINT = `enter send · ctrl+l model · ${LINX_TUI_KEYMAP_COMMAND} ${LINX_TUI_KEYMAP_LABEL} · ${LINX_TUI_EXIT_COMMAND}`
export const LINX_TUI_READY_DRAFT_HINT = 'enter send · shift+enter newline · alt+enter follow-up'
export const LINX_TUI_RUNNING_FOOTER_HINT = `ctrl+c interrupt · ${LINX_TUI_KEYMAP_COMMAND} ${LINX_TUI_KEYMAP_LABEL} · ${LINX_TUI_EXIT_COMMAND}`
export const LINX_TUI_RUNNING_DRAFT_HINT = 'enter steer · shift+enter newline · alt+enter follow-up'
export const LINX_TUI_AUTO_MODE_HEADER_HINT = ' enter send | ctrl+l model | alt+up restore | ctrl+o tools | ctrl+c clear / double quit '
export const LINX_TUI_AUTO_MODE_READY_NOTE = `Use ${LINX_TUI_KEYMAP_COMMAND} for ${LINX_TUI_KEYMAP_LABEL}. Type ${LINX_TUI_EXIT_COMMAND} to leave this session.`
export const LINX_TUI_AUTO_MODE_HELP_ACTIVITY = `Keymap: enter send · ctrl+l model · /auto on|off|status · /goal <peer-command> · /rewind [turns] · ${LINX_TUI_EXIT_COMMAND}`
export const LINX_TUI_AUTO_MODE_HELP_TEXT = [
  `${LINX_TUI_KEYMAP_COMMAND} ${LINX_TUI_KEYMAP_LABEL}`,
  `${LINX_TUI_LOGIN_COMMAND} refresh LinX Cloud login`,
  `${LINX_TUI_LOGOUT_COMMAND} clear LinX Cloud login`,
  `${LINX_TUI_EXIT_COMMAND} leave this session`,
  '/model <id> switch backend model',
  '/auto status show whether auto is active',
  '/auto on let Secretary drive and ask when blocked',
  '/auto off return to direct user-driven chat',
  '/goal <peer-command> send a goal command to the current chat peer',
  '/rewind [turns] move the active session branch before recent user turns',
  '/symphony on|off|status switch current chat peer: Secretary vs worker/backend',
  '/debug on|off protocol view',
  '',
].join('\n')
