import { useRouterState } from '@tanstack/react-router'
import { useLoginController } from './controller'
import { LoginModal } from './LoginModal'

export function LoginOverlay() {
  const controller = useLoginController()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (
    pathname.startsWith('/auth/callback')
    || pathname.startsWith('/test/')
  ) {
    return null
  }

  return (
    <LoginModal
      view={controller.view}
      state={controller.state}
      error={controller.error}
      storedAccount={controller.storedAccount}
      storageConflict={controller.storageConflict}
      providers={controller.providers}
      localOnboarding={controller.localOnboarding}
      onContinueStoredAccount={controller.continueStoredAccount}
      onBackFromLocal={controller.backFromLocal}
      onContinueLocalLogin={controller.continueLocalLogin}
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
