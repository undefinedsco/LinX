import { useRouterState } from '@tanstack/react-router'
import { useLoginController } from './controller'
import { LoginModal } from './LoginModal'
import { useSession } from '@/providers/solid-session-provider'

export function LoginOverlay() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname.startsWith('/test/')) {
    return null
  }

  return <LoginOverlayContent hidden={pathname.startsWith('/auth/callback')} />
}

function LoginOverlayContent({ hidden = false }: { hidden?: boolean }) {
  const controller = useLoginController()
  const { session } = useSession()

  if (hidden) {
    return null
  }

  return (
    <LoginModal
      view={controller.view}
      state={session.info.isLoggedIn || controller.state !== 'authenticated'
        ? controller.state
        : 'idle'}
      error={controller.error}
      storedAccount={controller.storedAccount}
      storageConflict={controller.storageConflict}
      hasRestorableSession={controller.hasRestorableSession}
      providers={controller.providers}
      localOnboarding={controller.localOnboarding}
      localProviderSource={controller.localProviderSource}
      onContinueStoredAccount={controller.continueStoredAccount}
      onBackFromLocal={controller.backFromLocal}
      onContinueLocalLogin={controller.continueLocalLogin}
      onSaveLocalTunnelToken={controller.saveLocalTunnelToken}
      onTestLocalConnectivity={controller.testLocalConnectivity}
      onSwitchAccount={controller.switchAccount}
      onConnect={controller.connect}
      onCancelConnecting={controller.cancelConnecting}
      onAddProvider={controller.addProvider}
      onClearError={controller.clearError}
      onDismissStorageConflict={controller.dismissStorageConflict}
      onOpenCurrentSpacePodSetup={controller.openCurrentSpacePodSetup}
      localLoginStatus={controller.localLoginStatus}
      authWindowStatus={controller.authWindowStatus}
      connectingProvider={controller.connectingProvider}
    />
  )
}
