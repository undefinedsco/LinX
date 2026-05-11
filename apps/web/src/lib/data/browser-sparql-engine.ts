import { configureSparqlEngine } from '@undefineds.co/drizzle-solid'
import * as comunicaSolid from '@comunica/query-sparql-solid'

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

let installed = false

export function installBrowserSparqlEngine(): void {
  if (installed) {
    return
  }

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
