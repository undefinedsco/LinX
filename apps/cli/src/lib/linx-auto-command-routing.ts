import type { AutoModeControlCommandRoute } from '@linx/agent-runtime/auto-mode'
import { getSecretaryAutoInputController } from './secretary-auto-input-controller.js'
import { getSessionControlManager } from './session-control.js'
import {
  isLinxInteractiveAutoModeEnabled,
  notifyLinxInteractiveAutoControlChange,
  setLinxInteractiveAutoModeEnabled,
} from './linx-interactive-shell-state.js'

export async function routeLinxAutoCommand(
  interactive: any,
  runtime: any,
  route: AutoModeControlCommandRoute,
): Promise<void> {
  const auto = route.auto
  const enabled = auto?.action === 'set' ? auto.enabled : undefined
  const initialInput = auto?.action === 'set' ? auto.initialInput : undefined
  await handleInteractiveAutoCommand(interactive, runtime, enabled, {
    scheduleImmediately: initialInput === undefined,
  })
  if (initialInput) {
    const controller = getSecretaryAutoInputController(
      interactive,
      runtime,
      getSessionControlManager(interactive, runtime),
    )
    await controller.submit(initialInput, { reason: 'auto-on' })
  }
}

export async function handleInteractiveAutoCommand(
  interactive: any,
  runtime: any,
  enabled: boolean | undefined,
  options: { scheduleImmediately?: boolean } = {},
): Promise<void> {
  if (enabled === undefined) {
    const active = isLinxInteractiveAutoModeEnabled(interactive, runtime)
    interactive.showStatus?.(formatAutoModeChangeStatus(active))
    interactive.ui?.requestRender?.()
    return
  }

  const control = getSessionControlManager(interactive, runtime)
  control.setAutoEnabled(enabled)
  setLinxInteractiveAutoModeEnabled(interactive, runtime, enabled)
  const controller = getSecretaryAutoInputController(interactive, runtime, control)
  if (enabled) {
    controller.start({ scheduleImmediately: options.scheduleImmediately !== false })
  } else {
    controller.stop()
  }
  interactive.showStatus?.(formatAutoModeChangeStatus(enabled))
  interactive.ui?.requestRender?.()
  await notifyLinxInteractiveAutoControlChange(interactive, enabled)
}

function formatAutoModeChangeStatus(enabled: boolean): string {
  return enabled
    ? [
      'Auto is on.',
      'Auto on: Secretary drives the current session input loop.',
      'What changed: backend prompts and blocked approval/input requests go to Secretary first; Secretary answers in-policy and asks you only when blocked.',
      'User-visible state: the input bar shows auto; Ctrl+C or /auto off hands control back to you.',
      'Backend approval policy is unchanged.',
    ].join('\n')
    : [
      'Auto is off.',
      'Auto off: you drive the current session directly.',
      'What changed: backend prompts, approvals, and free-form input return to the local TUI unless another explicit control path handles them.',
      'Auto only controls input ownership; it does not change whether the current chat peer is Secretary or worker/backend.',
      'Use /auto on to hand control back to Secretary.',
    ].join('\n')
}
