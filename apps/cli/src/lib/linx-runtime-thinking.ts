import { LINX_CLOUD_PROVIDER_ID } from './linx-cloud-models.js'

export function enableLinxXhighThinking(session: {
  model?: { provider?: string; reasoning?: boolean }
  supportsXhighThinking?: () => boolean
  getAvailableThinkingLevels?: () => string[]
}): void {
  const originalSupportsXhighThinking = session.supportsXhighThinking?.bind(session)
  const originalGetAvailableThinkingLevels = session.getAvailableThinkingLevels?.bind(session)

  session.supportsXhighThinking = () => (
    session.model?.provider === LINX_CLOUD_PROVIDER_ID && session.model.reasoning
      ? (session.getAvailableThinkingLevels?.().includes('xhigh') ?? true)
      : (originalSupportsXhighThinking?.() ?? false)
  )

  if (originalGetAvailableThinkingLevels) {
    session.getAvailableThinkingLevels = () => {
      const levels = originalGetAvailableThinkingLevels()
      if (session.model?.provider === LINX_CLOUD_PROVIDER_ID && session.model.reasoning && !levels.includes('xhigh')) {
        return [...levels, 'xhigh']
      }
      return levels
    }
  }
}
