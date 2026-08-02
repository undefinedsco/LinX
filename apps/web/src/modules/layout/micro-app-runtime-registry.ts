import type { MicroAppRuntime, MicroAppRuntimeRegistry } from './micro-app-runtime'

type RuntimeLoader = () => Promise<MicroAppRuntime>

function lazyRuntime(load: RuntimeLoader): MicroAppRuntime {
  return {
    async activate(context) {
      const runtime = await load()
      return runtime.activate(context)
    },
  }
}

export const microAppRuntimeRegistry: MicroAppRuntimeRegistry = {
  chat: lazyRuntime(() => import('@/modules/chat/runtime').then(({ chatRuntime }) => chatRuntime)),
  contacts: lazyRuntime(() => import('@/modules/contacts/runtime').then(({ contactsRuntime }) => contactsRuntime)),
  favorites: lazyRuntime(() => import('@/modules/favorites/runtime').then(({ favoritesRuntime }) => favoritesRuntime)),
  files: lazyRuntime(() => import('@/modules/files/runtime').then(({ filesRuntime }) => filesRuntime)),
  inbox: lazyRuntime(() => import('@/modules/inbox/runtime').then(({ inboxRuntime }) => inboxRuntime)),
}
