type LinxInteractiveExtensionSelectorTarget = {
  showExtensionSelector?: (title: string, options: string[], ...args: unknown[]) => Promise<unknown> | unknown
}

export function canChooseLinxInteractiveExtensionSelectorOption(
  target: unknown,
): boolean {
  return typeof asLinxInteractiveExtensionSelectorTarget(target)?.showExtensionSelector === 'function'
}

export async function chooseLinxInteractiveExtensionSelectorOption(
  target: unknown,
  title: string,
  options: string[],
  ...args: unknown[]
): Promise<unknown> {
  return asLinxInteractiveExtensionSelectorTarget(target)?.showExtensionSelector?.(title, options, ...args)
}

function asLinxInteractiveExtensionSelectorTarget(target: unknown): LinxInteractiveExtensionSelectorTarget | undefined {
  return target && typeof target === 'object'
    ? target as LinxInteractiveExtensionSelectorTarget
    : undefined
}
