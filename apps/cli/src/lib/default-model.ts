export const DEFAULT_LINX_CLOUD_MODEL_ID = 'linx-lite'

export function resolvePreferredLinxCloudModelId(
  models: Array<{ id: string }>,
  fallback = DEFAULT_LINX_CLOUD_MODEL_ID,
): string {
  const ids = models
    .map((model) => model.id?.trim())
    .filter((id): id is string => Boolean(id))

  return ids.find((id) => id === DEFAULT_LINX_CLOUD_MODEL_ID) ?? ids[0] ?? fallback
}
