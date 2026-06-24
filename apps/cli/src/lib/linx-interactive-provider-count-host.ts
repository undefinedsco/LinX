export type LinxInteractiveProviderCountTarget = {
  updateAvailableProviderCount?: () => Promise<unknown> | unknown
}

export async function refreshLinxInteractiveProviderCount(
  target: LinxInteractiveProviderCountTarget | null | undefined,
): Promise<void> {
  await target?.updateAvailableProviderCount?.()
}
