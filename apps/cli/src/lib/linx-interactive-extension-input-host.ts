export type LinxInteractiveExtensionInputTarget = {
  showExtensionInput?: (title: string, ...args: unknown[]) => Promise<unknown> | unknown
}

export function canCollectLinxInteractiveExtensionInput(
  target: LinxInteractiveExtensionInputTarget | null | undefined,
): boolean {
  return typeof target?.showExtensionInput === 'function'
}

export async function collectLinxInteractiveExtensionInput(
  target: LinxInteractiveExtensionInputTarget | null | undefined,
  title: string,
  ...args: unknown[]
): Promise<unknown> {
  return target?.showExtensionInput?.(title, ...args)
}
