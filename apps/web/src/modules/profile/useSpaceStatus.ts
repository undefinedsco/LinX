import { useMemo } from 'react'
import { useLoginStore } from '@linx/stores/login'
import { useBrowserOnline } from '@/lib/use-browser-online'
import { getRuntimeShellInfo } from '@/lib/runtime-shell'
import { useLocalOnboarding } from '@/modules/login/hooks/use-local-onboarding'
import { useModelServices } from '@/modules/model-services/data/use-model-services'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import {
  resolveSpaceAttention,
  resolveSpaceKind,
  spaceKindLabel,
} from './domain/space-status'

/** The LinX platform connection is available to every account without a key. */
const PLATFORM_PROVIDER_ID = 'undefineds'

export function useSpaceStatus() {
  const storedAccount = useLoginStore((state) => state.storedAccount)
  const { status: databaseStatus } = useSolidDatabase()
  const online = useBrowserOnline()
  const modelServices = useModelServices()
  const localOnboarding = useLocalOnboarding()
  const isDesktop = getRuntimeShellInfo().id === 'desktop'
  const localState = localOnboarding.snapshot?.state ?? null
  const localLoading = localOnboarding.loading

  return useMemo(() => {
    const providers = Object.values(modelServices.providers ?? {})
    const connectedProviders = providers.filter((provider) => (
      provider.enabled || provider.id === PLATFORM_PROVIDER_ID
    ))
    // "Still checking" and "could not read" are different: neither may claim
    // the AI is connected or missing.
    //
    // A deployment directory that is unsupported or failed is also NOT an empty
    // directory: with no personal connection we cannot say the account has no
    // AI, only that we do not know. Claiming 'not-connected' there is the exact
    // false certainty the directory state exists to prevent.
    //
    // Order matters. A provider the account already connected is positive proof
    // of AI, so it wins over an uncertain directory: the directory can only
    // weaken a "nothing is available" conclusion, never a "something works" one.
    const directory = modelServices.builtinDirectory
    const directoryUnknown = directory.status === 'failed' || directory.status === 'unsupported'
    const aiStatus: 'checking' | 'connected' | 'not-connected' | 'unknown' = databaseStatus !== 'ready'
      || modelServices.isLoading
      || directory.status === 'loading'
      ? 'checking'
      : modelServices.error
        ? 'unknown'
        : connectedProviders.length > 0
          ? 'connected'
          : directoryUnknown ? 'unknown' : 'not-connected'
    const aiConnected = aiStatus === 'connected' ? true : aiStatus === 'not-connected' ? false : null
    const spaceKind = resolveSpaceKind(storedAccount)
    // Only the desktop app runs a local service; elsewhere there is nothing to start.
    const localServiceRunning = !isDesktop || spaceKind === 'cloud' || localLoading || !localState
      || localState === 'starting' || localState === 'checking'
      ? null
      : localState === 'ready'
    return {
      spaceKind,
      spaceLabel: spaceKindLabel(spaceKind),
      providerHost: storedAccount?.storageProviderUrl ?? storedAccount?.issuerUrl ?? null,
      issuerLabel: storedAccount?.issuerLabel ?? null,
      databaseStatus,
      online,
      aiConnected,
      aiStatus,
      connectedProviderCount: connectedProviders.length,
      localServiceRunning,
      attention: resolveSpaceAttention({ online, databaseStatus, aiConnected, localServiceRunning }),
    }
  }, [databaseStatus, isDesktop, localLoading, localState, modelServices.builtinDirectory, modelServices.error, modelServices.isLoading, modelServices.providers, online, storedAccount])
}
