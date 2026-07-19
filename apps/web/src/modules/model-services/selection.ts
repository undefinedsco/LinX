import type { AIProvider } from './types'

export function resolveSelectedProviderId(
  providers: Record<string, AIProvider>,
  selectedProviderId: string | null,
): string | null {
  if (selectedProviderId && providers[selectedProviderId]) {
    return selectedProviderId
  }

  return Object.keys(providers)[0] ?? null
}
