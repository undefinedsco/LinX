import { useLoginController } from './controller'
import { LoginModal } from './LoginModal'

export function LoginOverlay() {
  const controller = useLoginController()

  return (
    <LoginModal
      state={controller.state}
      error={controller.error}
      failedProvider={controller.failedProvider}
      selectedProvider={controller.selectedProvider}
      storedAccount={controller.storedAccount}
      providers={controller.providers}
      isConnecting={controller.isConnecting}
      localService={controller.localService}
      isLaunching={controller.isLaunching}
      onConnect={controller.connect}
      onAddProvider={controller.addProvider}
      onDeleteProvider={controller.deleteProvider}
      onLaunchLocalService={controller.onLaunchLocalService}
      onSignOut={controller.signOut}
      onClearError={controller.clearError}
    />
  )
}
