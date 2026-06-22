import {
  MAX_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS,
  MIN_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS,
  type AutoModeSecretaryRecommendation,
} from '@linx/agent-runtime/auto-mode'

export interface AutoModeSecretaryReactionWindowInput {
  canAutoDecide?: boolean
  reactionWindowMs?: number
  source?: AutoModeSecretaryRecommendation['source']
}

export function resolveSecretaryReactionWindowMs(recommendation?: AutoModeSecretaryReactionWindowInput | null): number {
  if (!recommendation?.canAutoDecide) {
    return 0
  }

  const reactionWindowMs = recommendation.reactionWindowMs ?? 0
  if (recommendation.source === 'fallback') {
    return Math.max(0, Math.min(MAX_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS, reactionWindowMs))
  }

  return Math.max(
    MIN_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS,
    Math.min(
      MAX_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS,
      reactionWindowMs > 0 ? reactionWindowMs : MIN_AUTO_MODE_SECRETARY_REACTION_WINDOW_MS,
    ),
  )
}
