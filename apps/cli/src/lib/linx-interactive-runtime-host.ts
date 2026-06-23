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

export function getInteractiveRuntimePodSession(interactive: any): any {
  return interactive?.runtime?.podSession
}
