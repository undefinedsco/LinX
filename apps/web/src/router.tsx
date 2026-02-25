import { createRouter, createRootRoute, createRoute, Outlet, redirect } from '@tanstack/react-router'
import { useNavigate, useParams } from '@tanstack/react-router'
import SolidAuthCallback from './components/AuthCallback'
import { PrimaryLayout } from './modules/layout/PrimaryLayout'
import { defaultMicroAppId, isValidMicroAppId, MicroAppId } from './modules/layout/micro-app-registry'
import { SolidLoginOverlay } from './modules/login'
import { DebugSearchableSelect } from './components/debug/DebugSearchableSelect'
import { DebugChatPage } from './components/debug/DebugChatPage'
import { getRedirectPath } from './modules/login/login-utils'
import InruptTest from './pages/InruptTest'
import InruptSimpleTest from './pages/InruptSimpleTest'
import SolidUiReactTest from './app/test/solid-ui-react'
import { SetupView } from './modules/settings'

// Root route component
const RootComponent = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
      <SolidLoginOverlay />
    </div>
  )
}

// Root without login overlay (for testing)
const RootWithoutOverlay = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
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
  component: DebugSearchableSelect,
})

const debugChatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/debug/chat',
  component: DebugChatPage,
})

// Inrupt 测试路由
const inruptTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inrupt-test',
  component: InruptTest,
})

// solid-ui-react 测试路由
const solidUiReactTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/test/solid-ui-react',
  component: SolidUiReactTest,
})

// Inrupt Simple 测试路由 (本地模块)
const inruptSimpleTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/test/inrupt-simple',
  component: InruptSimpleTest,
})

// Setup route for LinX Service configuration
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupView,
})

// Auth callback route
const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: () => {
    const navigate = useNavigate()
    return (
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
    )
  },
})

const microAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$microAppId',
  beforeLoad: ({ params }) => {
    /*
    if (!isValidMicroAppId(params.microAppId)) {
      throw redirect({
        to: '/$microAppId',
        params: { microAppId: defaultMicroAppId },
      })
    }
    */
  },
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
