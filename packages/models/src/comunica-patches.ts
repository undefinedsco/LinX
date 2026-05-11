type NodeRequire = (id: string) => unknown

const COMUNICA_OBSERVER_MODULES = [
  '@comunica/actor-query-result-serialize-sparql-json',
  '@comunica/actor-query-result-serialize-stats',
  '@comunica/query-sparql-solid/node_modules/@comunica/actor-query-result-serialize-sparql-json',
  '@comunica/query-sparql-solid/node_modules/@comunica/actor-query-result-serialize-stats',
]

type NodeProcess = {
  getBuiltinModule?: (id: string) => { createRequire?: (url: string | URL) => NodeRequire } | undefined
}

export function applySolidComunicaPatches(requireModule?: NodeRequire): boolean {
  const resolvedRequire = requireModule ?? createNodeRequire()
  if (!resolvedRequire) {
    return false
  }

  return COMUNICA_OBSERVER_MODULES
    .map((moduleName) => patchActionObserverHttp(resolvedRequire, moduleName))
    .some(Boolean)
}

function createNodeRequire(): NodeRequire | null {
  const nodeProcess = typeof globalThis.process === 'object'
    ? globalThis.process as NodeProcess
    : undefined
  const createRequire = nodeProcess?.getBuiltinModule?.('module')?.createRequire
  if (typeof createRequire !== 'function') {
    return null
  }
  return createRequire(import.meta.url)
}

function patchActionObserverHttp(requireModule: NodeRequire, moduleName: string): boolean {
  try {
    const module = requireModule(moduleName) as {
      ActionObserverHttp?: {
        prototype?: {
          onRun?: (actor: unknown, action: unknown, output: unknown) => unknown
          __linxObservedActorsPatchApplied?: boolean
        }
      }
    }
    const prototype = module.ActionObserverHttp?.prototype
    const originalOnRun = prototype?.onRun
    if (!prototype || typeof originalOnRun !== 'function') {
      return false
    }
    if (prototype.__linxObservedActorsPatchApplied) {
      return true
    }

    prototype.onRun = function patchedActionObserverOnRun(
      this: { observedActors?: unknown },
      actor: unknown,
      action: unknown,
      output: unknown,
    ) {
      if (!Array.isArray(this.observedActors)) {
        this.observedActors = []
      }
      return originalOnRun.call(this, actor, action, output)
    }
    prototype.__linxObservedActorsPatchApplied = true
    return true
  } catch {
    return false
  }
}
