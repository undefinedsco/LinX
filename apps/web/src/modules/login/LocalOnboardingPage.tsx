import { useNavigate } from '@tanstack/react-router'
import { defaultAppletId } from '@/modules/layout/applet-registry'
import { LocalOnboardingScreen } from './LocalOnboardingCard'

export function LocalOnboardingPage() {
  const navigate = useNavigate()

  return (
    <LocalOnboardingScreen
      onBack={() => navigate({ to: '/$appletId', params: { appletId: defaultAppletId } })}
    />
  )
}
