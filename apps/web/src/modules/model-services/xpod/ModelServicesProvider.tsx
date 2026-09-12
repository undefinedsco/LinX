import { createContext, useContext, useMemo, type PropsWithChildren } from 'react'
import { EVENTS } from '@inrupt/solid-client-authn-browser'
import { aiConnectionApplet, type AiConnectionsController } from '@undefineds.co/ai-connections'
import { useApplet } from '@undefineds.co/extension-sdk/react'
import type { MountedTwoPaneApplet, WebExtensionHost } from '@undefineds.co/extension-sdk/web'
import type { SolidSessionSnapshot } from '@undefineds.co/solid-sdk'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'

type MountedAiConnections = MountedTwoPaneApplet<AiConnectionsController>

const ModelServicesContext = createContext<MountedAiConnections | null>(null)

export function ModelServicesProvider({ children }: PropsWithChildren) {
  const { session, sessionRequestInProgress } = useSession()
  const database = useSolidDatabase()
  const webId = session.info.webId
  const podUrl = database.db ? resolveCurrentPodBaseUrl(database.db) : null

  const host = useMemo<WebExtensionHost>(() => ({
    solid: {
      session: {
        fetch: session.fetch,
        getSnapshot: () => sessionSnapshot(sessionRequestInProgress, session.info.isLoggedIn, webId),
        subscribe: (listener) => {
          const publish = () => listener(sessionSnapshot(false, session.info.isLoggedIn, session.info.webId))
          session.events.on(EVENTS.LOGIN, publish)
          session.events.on(EVENTS.SESSION_RESTORED, publish)
          session.events.on(EVENTS.LOGOUT, publish)
          session.events.on(EVENTS.ERROR, publish)
          return () => {
            session.events.off(EVENTS.LOGIN, publish)
            session.events.off(EVENTS.SESSION_RESTORED, publish)
            session.events.off(EVENTS.LOGOUT, publish)
            session.events.off(EVENTS.ERROR, publish)
          }
        },
      },
      pod: database.status === 'ready' && database.db && webId && podUrl
        ? { status: 'ready', current: { webId, podUrl, database: database.db, collections: 'ready' } }
        : database.status === 'error'
          ? { status: 'error', error: database.error ?? new Error('当前 Pod 打开失败。') }
          : session.info.isLoggedIn
            ? { status: 'opening' }
            : { status: 'unavailable' },
      requireLogin: async () => {
        window.location.assign('/login')
      },
    },
    navigation: {
      openExternal: async (url) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
    },
    capabilities: {},
  }), [database.db, database.error, database.status, podUrl, session, sessionRequestInProgress, webId])

  const mounted = useApplet(aiConnectionApplet, host)
  if (!mounted || mounted.layout !== 'two-pane') return <>{children}</>

  return (
    <ModelServicesContext.Provider value={mounted as MountedAiConnections}>
      {children}
    </ModelServicesContext.Provider>
  )
}

export function useMountedModelServices() {
  const mounted = useContext(ModelServicesContext)
  if (!mounted) throw new Error('Xpod 模型服务尚未就绪。')
  return mounted
}

function sessionSnapshot(
  inProgress: boolean,
  isLoggedIn: boolean,
  webId: string | undefined,
): SolidSessionSnapshot {
  if (inProgress && !(isLoggedIn && webId)) return { status: 'initializing' }
  if (isLoggedIn && webId) return { status: 'authenticated', webId }
  return { status: 'anonymous' }
}
