export interface ChatConnectivityProbeOptions {
  fetcher: typeof fetch
  podBaseUrl: string | null | undefined
  signal?: AbortSignal
}

/**
 * `navigator.onLine` describes the browser's network adapter, not whether the
 * selected Pod can be reached. Local-first deployments can have a healthy
 * localhost Xpod while Chromium reports `false`, so an actual HTTP response is
 * the connectivity authority. Any response proves transport reachability;
 * authorization and server failures are handled by their own recovery paths.
 */
export async function probeChatConnectivity({
  fetcher,
  podBaseUrl,
  signal,
}: ChatConnectivityProbeOptions): Promise<boolean> {
  if (!podBaseUrl) return false

  try {
    const probeUrl = new URL(
      'profile/card',
      `${podBaseUrl.replace(/\/+$/u, '')}/`,
    ).href
    await fetcher(probeUrl, {
      method: 'HEAD',
      cache: 'no-store',
      signal,
    })
    return true
  } catch (error) {
    if (signal?.aborted) throw error
    return false
  }
}
