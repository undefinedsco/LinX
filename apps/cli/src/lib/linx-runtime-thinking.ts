import { LINX_CLOUD_PROVIDER_ID } from './linx-cloud-models.js'
import { registerLinxSessionThinkingCapabilityHandler, type LinxThinkingSession } from './linx-session-thinking-capability-router.js'

export function enableLinxXhighThinking(session: LinxThinkingSession): void {
  registerLinxSessionThinkingCapabilityHandler(session, {
    name: 'linx-cloud:xhigh-thinking',
    priority: 0,
    supportsXhighThinking({ session: targetSession, getAvailableThinkingLevels }) {
      if (targetSession.model?.provider !== LINX_CLOUD_PROVIDER_ID || !targetSession.model.reasoning) {
        return undefined
      }
      return getAvailableThinkingLevels()?.includes('xhigh') ?? true
    },
    getAvailableThinkingLevels({ session: targetSession, levels }) {
      if (targetSession.model?.provider === LINX_CLOUD_PROVIDER_ID && targetSession.model.reasoning && !levels.includes('xhigh')) {
        return [...levels, 'xhigh']
      }
      return levels
    },
  })
}
