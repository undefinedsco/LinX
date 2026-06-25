type BeforeSessionInvalidateHook = () => void
type RebindSessionHook = (session: unknown) => Promise<void>

interface InteractiveRuntimeHostHooks {
  beforeSessionInvalidate?: BeforeSessionInvalidateHook
  rebindSession?: RebindSessionHook
}

const runtimeHostHooks = new WeakMap<object, InteractiveRuntimeHostHooks>()

export function ensureInteractiveRuntimeHost(runtime: any): void {
  if (!runtime || typeof runtime !== 'object') {
    return
  }

  ensureRuntimeHostHooks(runtime)

  if (typeof runtime.setBeforeSessionInvalidate !== 'function') {
    runtime.setBeforeSessionInvalidate = (callback?: BeforeSessionInvalidateHook): void => {
      setInteractiveRuntimeBeforeSessionInvalidate(runtime, callback)
    }
  }

  if (typeof runtime.setRebindSession !== 'function') {
    runtime.setRebindSession = (callback?: RebindSessionHook): void => {
      setInteractiveRuntimeRebindSession(runtime, callback)
    }
  }
}

export function getInteractiveRuntimeBeforeSessionInvalidate(runtime: unknown): BeforeSessionInvalidateHook | undefined {
  return getRuntimeHostHooks(runtime).beforeSessionInvalidate
}

export function getInteractiveRuntimeRebindSession(runtime: unknown): RebindSessionHook | undefined {
  return getRuntimeHostHooks(runtime).rebindSession
}

function setInteractiveRuntimeBeforeSessionInvalidate(runtime: object, callback?: BeforeSessionInvalidateHook): void {
  const hooks = ensureRuntimeHostHooks(runtime)
  if (callback) {
    hooks.beforeSessionInvalidate = callback
  } else {
    delete hooks.beforeSessionInvalidate
  }
}

function setInteractiveRuntimeRebindSession(runtime: object, callback?: RebindSessionHook): void {
  const hooks = ensureRuntimeHostHooks(runtime)
  if (callback) {
    hooks.rebindSession = callback
  } else {
    delete hooks.rebindSession
  }
}

function ensureRuntimeHostHooks(runtime: object): InteractiveRuntimeHostHooks {
  let hooks = runtimeHostHooks.get(runtime)
  if (!hooks) {
    hooks = {}
    runtimeHostHooks.set(runtime, hooks)
  }
  return hooks
}

function getRuntimeHostHooks(runtime: unknown): InteractiveRuntimeHostHooks {
  return runtime && typeof runtime === 'object'
    ? runtimeHostHooks.get(runtime) ?? {}
    : {}
}

export function setInteractiveRuntimePodSession(interactive: any, podSession: unknown): void {
  const runtime = interactive?.runtime
  if (runtime && typeof runtime === 'object') {
    runtime.podSession = podSession
  }
}

export function setLinxInteractiveRuntime(interactive: any, runtime: unknown): void {
  if (interactive && typeof interactive === 'object') {
    interactive.runtime = runtime
  }
}

export function getInteractiveRuntimePodSession(interactive: any): any {
  return interactive?.runtime?.podSession
}

export function getLinxInteractiveRuntime(interactive: any): any {
  return interactive?.runtime
}

export function resolveLinxInteractiveRuntimeProviderLabel(interactive: any): string {
  const bridge = getLinxInteractiveRuntimeAuthBridge(interactive)
  return normalizeRuntimeHostString(bridge?.providerLabel) ?? 'LinX Cloud'
}

export function clearLinxInteractiveRuntimeAuthPromptOnStart(interactive: any): void {
  const bridge = getLinxInteractiveRuntimeAuthBridge(interactive)
  if (bridge && typeof bridge === 'object') {
    bridge.shouldPromptLoginOnStart = false
  }
}

function getLinxInteractiveRuntimeAuthBridge(interactive: any): any {
  return interactive?.runtimeHost?.linxAuthBridge
    ?? interactive?.runtime?.linxAuthBridge
    ?? interactive?.linxAuthBridge
}

export async function resolveLinxInteractivePodWebId(interactive: any): Promise<string | undefined> {
  const candidates = [
    interactive?.podSession?.webId,
    getInteractiveRuntimePodSession(interactive)?.webId,
    interactive?.session?.podSession?.webId,
    interactive?.session?.runtime?.podSession?.webId,
    interactive?.session?.state?.webId,
    interactive?.state?.webId,
  ]
  for (const candidate of candidates) {
    const normalized = normalizeRuntimeHostString(candidate)
    if (normalized) {
      return normalized
    }
  }

  const podSession = await interactive?.runtime?.getPodDataSession?.().catch(() => null)
  const webId = normalizeRuntimeHostString(podSession?.webId)
  if (webId) {
    setInteractiveRuntimePodSession(interactive, podSession)
    return webId
  }
  return undefined
}

function normalizeRuntimeHostString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
