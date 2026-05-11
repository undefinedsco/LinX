import { useNavigate } from '@tanstack/react-router'
import { defaultMicroAppId } from '@/modules/layout/micro-app-registry'
import { LocalOnboardingScreen } from './LocalOnboardingCard'

export function LocalOnboardingPage() {
  const navigate = useNavigate()

  return (
    <LocalOnboardingScreen
      onBack={() => navigate({ to: '/$microAppId', params: { microAppId: defaultMicroAppId } })}
    />
  )
}
