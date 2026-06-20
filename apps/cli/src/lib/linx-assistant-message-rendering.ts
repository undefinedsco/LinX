import { AssistantMessageComponent } from '@earendil-works/pi-coding-agent'

let assistantMessagePatched = false

export function patchPiAssistantMessageRendering(): void {
  if (assistantMessagePatched) {
    return
  }

  const originalUpdateContent = AssistantMessageComponent.prototype.updateContent
  AssistantMessageComponent.prototype.updateContent = function patchedUpdateContent(message: unknown): void {
    const sanitizedMessage = stripLinxHiddenAssistantContent(message) as Parameters<typeof originalUpdateContent>[0]
    return originalUpdateContent.call(this, sanitizedMessage)
  }
  assistantMessagePatched = true
}

function stripLinxHiddenAssistantContent(message: unknown): unknown {
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return message
  }

  const content = message.content.filter((part) => !isLinxHiddenAssistantContentPart(part))
  if (content.length === message.content.length) {
    return message
  }

  return {
    ...message,
    content,
  }
}

function isLinxHiddenAssistantContentPart(part: unknown): boolean {
  return isRecord(part) && part.type === 'thinking'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
