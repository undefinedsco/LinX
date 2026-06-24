export type LinxInteractiveSelectorFactory = (done: () => void) => {
  component: unknown
  focus: unknown
}

type LinxInteractiveSelectorTarget = {
  showSelector?: (create: LinxInteractiveSelectorFactory) => void
}

export function canShowLinxInteractiveSelector(target: unknown): boolean {
  return typeof asLinxInteractiveSelectorTarget(target)?.showSelector === 'function'
}

export function showLinxInteractiveSelector(
  target: unknown,
  create: LinxInteractiveSelectorFactory,
): void {
  asLinxInteractiveSelectorTarget(target)?.showSelector?.(create)
}

function asLinxInteractiveSelectorTarget(target: unknown): LinxInteractiveSelectorTarget | undefined {
  return target && typeof target === 'object'
    ? target as LinxInteractiveSelectorTarget
    : undefined
}
