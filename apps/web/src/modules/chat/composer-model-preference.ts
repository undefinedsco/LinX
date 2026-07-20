export const THREAD_COMPOSER_MODEL_METADATA_KEY = 'linxComposerModel'

export function readThreadComposerModel(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[THREAD_COMPOSER_MODEL_METADATA_KEY]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function withThreadComposerModel(
  metadata: Record<string, unknown> | undefined,
  model: unknown,
): Record<string, unknown> | undefined {
  if (typeof model !== 'string' || !model.trim()) return metadata
  return {
    ...(metadata ?? {}),
    [THREAD_COMPOSER_MODEL_METADATA_KEY]: model.trim(),
  }
}
