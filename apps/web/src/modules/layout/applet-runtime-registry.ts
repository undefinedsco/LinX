import type { AppletRuntime, AppletRuntimeRegistry } from './applet-runtime'

type RuntimeLoader = () => Promise<AppletRuntime>

function lazyRuntime(load: RuntimeLoader): AppletRuntime {
  return {
    async activate(context) {
      const runtime = await load()
      return runtime.activate(context)
    },
  }
}

export const appletRuntimeRegistry: AppletRuntimeRegistry = {
  chat: lazyRuntime(() => import('@/modules/chat/runtime').then(({ chatRuntime }) => chatRuntime)),
  contacts: lazyRuntime(() => import('@/modules/contacts/runtime').then(({ contactsRuntime }) => contactsRuntime)),
  favorites: lazyRuntime(() => import('@/modules/favorites/runtime').then(({ favoritesRuntime }) => favoritesRuntime)),
  files: lazyRuntime(() => import('@/modules/files/runtime').then(({ filesRuntime }) => filesRuntime)),
  inbox: lazyRuntime(() => import('@/modules/inbox/runtime').then(({ inboxRuntime }) => inboxRuntime)),
}
