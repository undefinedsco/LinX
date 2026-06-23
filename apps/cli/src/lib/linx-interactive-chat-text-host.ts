import { Text } from '@earendil-works/pi-tui'

export function appendLinxInteractiveChatText(interactive: any, text: string): void {
  interactive.chatContainer?.addChild?.(new Text(text, 1, 0))
  interactive.ui?.requestRender?.()
}
