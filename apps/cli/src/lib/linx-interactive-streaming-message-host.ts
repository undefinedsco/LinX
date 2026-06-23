export function clearLinxInteractiveStreamingMessage(interactive: any): void {
  const streamingComponent = interactive?.streamingComponent
  if (streamingComponent) {
    interactive.chatContainer?.removeChild?.(streamingComponent)
  }

  interactive.streamingComponent = undefined
  interactive.streamingMessage = undefined
  interactive.footer?.invalidate?.()
  interactive.ui?.requestRender?.()
}
