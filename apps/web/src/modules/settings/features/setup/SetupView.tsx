import type { SetupConfig } from '../../domain/types'
import { SetupView as SetupViewUI } from '../../ui/SetupView'
import { useSetupViewController } from './useSetupViewController'

export interface SetupViewProps {
  onComplete?: (config: SetupConfig) => void
}

export function SetupView({ onComplete }: SetupViewProps) {
  const controller = useSetupViewController({ onComplete })
  return <SetupViewUI {...controller} />
}
