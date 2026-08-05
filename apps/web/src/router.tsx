import { Suspense, lazy, useCallback, useEffect, useMemo } from 'react'
import { createRouter, createRootRoute, createRoute, Outlet, redirect, createHashHistory } from '@tanstack/react-router'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { PrimaryLayout } from './modules/layout/PrimaryLayout'
import {
  defaultAppletId,
  isValidAppletId,
  AppletId,
  type AppletNavigationIntent,
} from './modules/layout/applet-registry'
import { SolidLoginOverlay } from './modules/login'
import { formatLoginErrorForUser } from './modules/login/error-messages'
import { consumePendingPostLoginAppletId, setPendingPostLoginAppletId } from './modules/login/login-utils'
import {
  validateFilesRouteSearch,
  withStructuredSubjectRouteSearch,
  type FilesStructuredSubjectRouteState,
  type FilesRouteSearch,
} from './modules/files/route-state'
import { FilesRouteBridgeProvider } from './modules/files/app/FilesRouteContext'
import { useFilesStore } from './modules/files/app/store'

const SolidAuthCallback = lazy(() => import('./components/AuthCallback'))
const DebugSearchableSelect = lazy(() =>
  import('./components/debug/DebugSearchableSelect').then((mod) => ({ default: mod.DebugSearchableSelect })),
)
const DebugChatPage = lazy(() =>
  import('./components/debug/DebugChatPage').then((mod) => ({ default: mod.DebugChatPage })),
)
const InruptTest = lazy(() => import('./pages/InruptTest'))
const InruptSimpleTest = lazy(() => import('./pages/InruptSimpleTest'))
const SolidUiReactTest = lazy(() => import('./app/test/solid-ui-react'))
const SetupView = lazy(() =>
  import('./modules/settings').then((mod) => ({ default: mod.SetupView })),
)

function RouteFallback() {
  return <div className="min-h-screen bg-background" />
}

// Root route component
const RootComponent = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
      <SolidLoginOverlay />
    </div>
  )
}

function RouteErrorComponent({ error }: { error: unknown }) {
  const message = formatLoginErrorForUser(error, '页面加载失败。请刷新页面，或重新进入 LinX。')

  return (
    <div className="min-h-screen bg-background p-4 text-sm text-destructive">
      <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
        <p className="font-medium">页面暂时无法打开</p>
        <p className="mt-2 leading-relaxed text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

// Not Found component
const NotFoundComponent = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-muted-foreground mb-4">页面未找到</p>
        <a href="/" className="text-primary hover:underline">
          返回首页
        </a>
      </div>
    </div>
  )
}

// Define the root route
const rootRoute = createRootRoute({
  component: RootComponent,
  errorComponent: RouteErrorComponent,
  notFoundComponent: NotFoundComponent,
})

// Debug route
const debugSearchSelectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/debug/search-select',
  component: () => (
    <Suspense fallback={<RouteFallback />}>
      <DebugSearchableSelect />
    </Suspense>
  ),
})

const debugChatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/debug/chat',
  component: () => (
    <Suspense fallback={<RouteFallback />}>
      <DebugChatPage />
    </Suspense>
  ),
})

// Inrupt 测试路由
const inruptTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inrupt-test',
  component: () => (
    <Suspense fallback={<RouteFallback />}>
      <InruptTest />
    </Suspense>
  ),
})

// solid-ui-react 测试路由
const solidUiReactTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/test/solid-ui-react',
  component: () => (
    <Suspense fallback={<RouteFallback />}>
      <SolidUiReactTest />
    </Suspense>
  ),
})

// Inrupt Simple 测试路由 (本地模块)
const inruptSimpleTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/test/inrupt-simple',
  component: () => (
    <Suspense fallback={<RouteFallback />}>
      <InruptSimpleTest />
    </Suspense>
  ),
})

// Setup route for LinX Service configuration
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: () => (
    <Suspense fallback={<RouteFallback />}>
      <SetupView />
    </Suspense>
  ),
})

function AuthCallbackRouteComponent() {
  const navigate = useNavigate()

  return (
    <Suspense fallback={<RouteFallback />}>
      <SolidAuthCallback
        onSuccess={() => navigate({ to: '/$appletId', params: { appletId: consumePendingPostLoginAppletId() }, replace: true })}
        onError={() => navigate({ to: '/$appletId', params: { appletId: defaultAppletId }, replace: true })}
      />
    </Suspense>
  )
}

// Auth callback route
const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: AuthCallbackRouteComponent,
})

const appletRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$appletId',
  validateSearch: validateFilesRouteSearch,
  beforeLoad: ({ params }) => {
    if (!isValidAppletId(params.appletId)) {
      throw redirect({
        to: '/$appletId',
        params: { appletId: defaultAppletId },
      })
    }
  },
  component: function AppletRouteComponent() {
    const { appletId: routeAppletId } = useParams({ from: appletRoute.id })
    const appletId = isValidAppletId(routeAppletId) ? routeAppletId : defaultAppletId
    const navigate = useNavigate({ from: appletRoute.id })
    const search = useSearch({ from: appletRoute.id }) as FilesRouteSearch
    useEffect(() => {
      setPendingPostLoginAppletId(appletId)
    }, [appletId])

    const filesRouteBridge = useMemo(() => ({
      search,
      pushStructuredSubjectRoute: (route: FilesStructuredSubjectRouteState) => {
        void navigate({
          search: (current) => withStructuredSubjectRouteSearch(current as Record<string, unknown>, route),
        })
      },
      clearStructuredSubjectRoute: () => {
        void navigate({
          replace: true,
          search: (current) => withStructuredSubjectRouteSearch(current as Record<string, unknown>, null),
        })
      },
    }), [navigate, search])

    const handleAppletNavigation = useCallback((id: AppletId, intent: AppletNavigationIntent) => {
      if (id !== 'files') return
      if (intent === 'chat-files') {
        useFilesStore.getState().openChatFilesScope()
        return
      }
      useFilesStore.getState().openAllFilesScope()
    }, [])

    return (
      <FilesRouteBridgeProvider bridge={filesRouteBridge}>
        <PrimaryLayout appletId={appletId as AppletId} onNavigate={handleAppletNavigation} />
      </FilesRouteBridgeProvider>
    )
  },
})

const homeRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({
      to: '/$appletId',
      params: { appletId: defaultAppletId },
    })
  },
  component: () => null,
})

const prefixedAppletRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/$appletId',
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$appletId',
      params: { appletId: isValidAppletId(params.appletId) ? (params.appletId as AppletId) : defaultAppletId },
    })
  },
  component: () => null,
})

const appDemoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/demo',
  beforeLoad: () => {
    throw redirect({
      to: '/$appletId',
      params: { appletId: defaultAppletId },
    })
  },
  component: () => null,
})

// 干净的Layout示例
// Create the route tree
const routeTree = rootRoute.addChildren([
  debugSearchSelectRoute,
  debugChatRoute,
  inruptTestRoute,
  solidUiReactTestRoute,
  inruptSimpleTestRoute,
  setupRoute,
  callbackRoute,
  homeRedirectRoute,
  appletRoute,
  prefixedAppletRoute,
  appDemoRoute,
])

// Create and export the router
const history = typeof window !== 'undefined' && window.location.protocol === 'file:'
  ? createHashHistory()
  : undefined

export const router = createRouter({ 
  routeTree,
  defaultPreload: 'intent',
  history,
})

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
