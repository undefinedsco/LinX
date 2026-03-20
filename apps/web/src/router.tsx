import { Suspense, lazy } from 'react'
import { createRouter, createRootRoute, createRoute, Outlet, redirect } from '@tanstack/react-router'
import { useNavigate, useParams } from '@tanstack/react-router'
import { PrimaryLayout } from './modules/layout/PrimaryLayout'
import { defaultMicroAppId, isValidMicroAppId, MicroAppId } from './modules/layout/micro-app-registry'
import { SolidLoginOverlay } from './modules/login'
import { getRedirectPath } from './modules/login/login-utils'

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

// Auth callback route
const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: () => {
    const navigate = useNavigate()
    return (
      <Suspense fallback={<RouteFallback />}>
        <SolidAuthCallback
          onSuccess={() => {
             const returnTo = getRedirectPath()
             if (returnTo && returnTo !== '/') {
               navigate({ to: returnTo as any, replace: true })
             } else {
               navigate({ to: '/$microAppId', params: { microAppId: 'chat' as MicroAppId }, replace: true })
             }
          }}
          onError={() => navigate({ to: '/$microAppId', params: { microAppId: defaultMicroAppId } })}
        />
      </Suspense>
    )
  },
})

const microAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$microAppId',
  component: function MicroAppRouteComponent() {
    const { microAppId } = useParams({ from: microAppRoute.id })
    return <PrimaryLayout microAppId={microAppId as MicroAppId} />
  },
})

const homeRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({
      to: '/$microAppId',
      params: { microAppId: defaultMicroAppId },
    })
  },
  component: () => null,
})

const prefixedMicroAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/$microAppId',
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$microAppId',
      params: { microAppId: isValidMicroAppId(params.microAppId) ? (params.microAppId as MicroAppId) : defaultMicroAppId },
    })
  },
  component: () => null,
})

const appDemoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/demo',
  beforeLoad: () => {
    throw redirect({
      to: '/$microAppId',
      params: { microAppId: defaultMicroAppId },
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
  microAppRoute,
  prefixedMicroAppRoute,
  appDemoRoute,
])

// Create and export the router
export const router = createRouter({ 
  routeTree,
  defaultPreload: 'intent',
})

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
