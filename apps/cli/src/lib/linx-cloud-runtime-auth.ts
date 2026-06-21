import {
  RemoteChatRequestError,
  type RemoteAuthFetch,
} from './chat-api.js'
import { formatLinxCloudTransientMessage } from './linx-cloud-errors.js'
import {
  getDefaultPodDataSession,
  type PodDataSession,
} from './pod-data-session.js'
import { isLinxRuntimeManagedAuthKey } from './linx-runtime-auth.js'

const DEFAULT_LINX_CLOUD_COMPLETION_TIMEOUT_MS = 10 * 60 * 1000

export const LINX_CLOUD_LOGIN_REQUIRED_MESSAGE =
  'No LinX cloud login found. Interactive TUI supports /login in-app. For non-interactive --print mode, run `linx login` first.'

export function createLinxBearerAuthFetch(apiKey: string): RemoteAuthFetch {
  return async (url, init) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${apiKey}`)
    return fetch(url, { ...init, headers })
  }
}

export function resolveRuntimeAuthFetchFromApiKey(apiKey: string | undefined): RemoteAuthFetch | null {
  const trimmed = apiKey?.trim()
  if (!trimmed || isLinxRuntimeManagedAuthKey(trimmed)) {
    return null
  }
  return createLinxBearerAuthFetch(trimmed)
}

export async function resolveLinxCloudRuntimeAuthFetch(options: {
  issuerUrl?: string
  getPodDataSession?: () => Promise<PodDataSession | null>
}): Promise<RemoteAuthFetch> {
  if (options.getPodDataSession) {
    return createPodDataSessionAuthFetch(options.getPodDataSession)
  }

  const session = await getDefaultPodDataSession()
  if (session) {
    return withLinxCloudCompletionTimeout(session.runtimeFetch)
  }

  throw new Error(LINX_CLOUD_LOGIN_REQUIRED_MESSAGE)
}

function createPodDataSessionAuthFetch(
  getPodDataSession: () => Promise<PodDataSession | null>,
): RemoteAuthFetch {
  if (getPodDataSession !== getDefaultPodDataSession) {
    return withLinxCloudCompletionTimeout(async (url, init) => {
      const session = await getPodDataSession()
      if (session) {
        try {
          return await session.runtimeFetch(url, init)
        } finally {
          await session.close().catch(() => undefined)
        }
      }

      throw new Error(LINX_CLOUD_LOGIN_REQUIRED_MESSAGE)
    })
  }

  let cachedSession: PodDataSession | null = null
  let cachedSessionPromise: Promise<PodDataSession | null> | null = null

  const getCachedSession = async (): Promise<PodDataSession | null> => {
    if (cachedSession) {
      return cachedSession
    }
    if (!cachedSessionPromise) {
      cachedSessionPromise = getPodDataSession().then((session) => {
        cachedSession = session
        return session
      }).finally(() => {
        cachedSessionPromise = null
      })
    }
    return cachedSessionPromise
  }

  return withLinxCloudCompletionTimeout(async (url, init) => {
    const session = await getCachedSession()
    if (session) {
      return await session.runtimeFetch(url, init)
    }

    throw new Error(LINX_CLOUD_LOGIN_REQUIRED_MESSAGE)
  })
}

export function withLinxCloudCompletionTimeout(fetcher: RemoteAuthFetch): RemoteAuthFetch {
  return async (url, init) => {
    if (!isChatCompletionRuntimeUrl(String(url))) {
      return fetcher(url, init)
    }

    const timeoutMs = resolveLinxCloudCompletionTimeoutMs()
    const controller = new AbortController()
    const signal = init?.signal
      ? combineAbortSignals(init.signal, controller.signal)
      : controller.signal
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      return await Promise.race([
        fetcher(url, { ...init, signal }),
        new Promise<Response>((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => {
            if (timedOut) {
              reject(new RemoteChatRequestError(
                formatLinxCloudTransientMessage(`Request exceeded ${formatTimeoutSeconds(timeoutMs)}s.`),
                0,
                `Timed out waiting for POST ${url}`,
              ))
            }
          }, { once: true })
        }),
      ])
    } catch (error) {
      if (timedOut) {
        throw new RemoteChatRequestError(
          formatLinxCloudTransientMessage(`Request exceeded ${formatTimeoutSeconds(timeoutMs)}s.`),
          0,
          error instanceof Error ? error.message : String(error),
        )
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

function resolveLinxCloudCompletionTimeoutMs(): number {
  const raw = process.env.LINX_CHAT_TIMEOUT_MS
  if (!raw) {
    return DEFAULT_LINX_CLOUD_COMPLETION_TIMEOUT_MS
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LINX_CLOUD_COMPLETION_TIMEOUT_MS
}

function formatTimeoutSeconds(timeoutMs: number): number {
  return Math.max(1, Math.round(timeoutMs / 1000))
}

function isChatCompletionRuntimeUrl(value: string): boolean {
  try {
    const target = new URL(value)
    const segments = target.pathname.split('/').filter(Boolean)
    return segments.length >= 3
      && /^v\d+$/.test(segments.at(-3) ?? '')
      && segments.at(-2) === 'chat'
      && segments.at(-1) === 'completions'
  } catch {
    return false
  }
}

function combineAbortSignals(left: AbortSignal, right: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([left, right])
  }
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (left.aborted || right.aborted) {
    abort()
    return controller.signal
  }
  left.addEventListener('abort', abort, { once: true })
  right.addEventListener('abort', abort, { once: true })
  return controller.signal
}
