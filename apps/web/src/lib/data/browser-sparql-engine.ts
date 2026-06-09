import { configureSparqlEngine } from '@undefineds.co/drizzle-solid'
import * as comunicaSolid from '@comunica/query-sparql-solid'
import * as sparqlJsonSerializer from '@comunica/actor-query-result-serialize-sparql-json'
import * as statsSerializer from '@comunica/actor-query-result-serialize-stats'

type QueryEngineConstructor = new () => unknown
type ComunicaModuleShape = {
  QueryEngine?: QueryEngineConstructor
  default?: {
    QueryEngine?: QueryEngineConstructor
  }
  'module.exports'?: {
    QueryEngine?: QueryEngineConstructor
  }
}
type ActionObserverHttpConstructor = {
  prototype?: {
    onRun?: (actor: unknown, action: unknown, output: unknown) => unknown
    __linxObservedActorsPatchApplied?: boolean
  }
}
type ObserverModuleShape = {
  ActionObserverHttp?: ActionObserverHttpConstructor
  default?: {
    ActionObserverHttp?: ActionObserverHttpConstructor
  }
  'module.exports'?: {
    ActionObserverHttp?: ActionObserverHttpConstructor
  }
}

let installed = false
let observersPatched = false

export function installBrowserSparqlEngine(): void {
  if (installed) {
    return
  }

  patchBrowserComunicaObservers()
  configureSparqlEngine({
    createQueryEngine: () => new (resolveQueryEngine())() as never,
  })
  installed = true
}

function resolveQueryEngine(): QueryEngineConstructor {
  const module = comunicaSolid as ComunicaModuleShape
  const QueryEngine =
    module.QueryEngine
    ?? module.default?.QueryEngine
    ?? module['module.exports']?.QueryEngine

  if (typeof QueryEngine !== 'function') {
    throw new Error('Comunica Solid QueryEngine is unavailable in the browser bundle.')
  }

  return QueryEngine
}

export function patchBrowserComunicaObservers(): boolean {
  if (observersPatched) {
    return true
  }

  observersPatched = [
    patchActionObserverModule(sparqlJsonSerializer as ObserverModuleShape),
    patchActionObserverModule(statsSerializer as ObserverModuleShape),
  ].some(Boolean)
  return observersPatched
}

function patchActionObserverModule(module: ObserverModuleShape): boolean {
  const constructors = [
    module.ActionObserverHttp,
    module.default?.ActionObserverHttp,
    module['module.exports']?.ActionObserverHttp,
  ]

  return constructors
    .map((constructor) => patchActionObserverConstructor(constructor))
    .some(Boolean)
}

function patchActionObserverConstructor(constructor: ActionObserverHttpConstructor | undefined): boolean {
  const prototype = constructor?.prototype
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
}
