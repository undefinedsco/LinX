import { describe, expect, it } from 'vitest'
import * as sparqlJsonSerializer from '@comunica/actor-query-result-serialize-sparql-json'
import * as statsSerializer from '@comunica/actor-query-result-serialize-stats'
import { patchBrowserComunicaObservers } from './browser-sparql-engine'

describe('browser-sparql-engine', () => {
  it('patches Comunica HTTP observers when observedActors is missing', () => {
    expect(patchBrowserComunicaObservers()).toBe(true)

    expectObserverDefaultsMissingActors(sparqlJsonSerializer)
    expectObserverDefaultsMissingActors(statsSerializer)
  })
})

function expectObserverDefaultsMissingActors(module: unknown): void {
  const prototype = (module as {
    ActionObserverHttp?: {
      prototype?: {
        onRun?: (this: { observedActors?: unknown; requests: number }, actor: { name: string }) => void
      }
    }
  }).ActionObserverHttp?.prototype

  if (!prototype?.onRun) {
    throw new Error('ActionObserverHttp.onRun is unavailable')
  }

  const observer = { requests: 0, observedActors: undefined as unknown }
  expect(() => prototype.onRun?.call(observer, { name: 'urn:comunica:default:http/actors#fetch' })).not.toThrow()
  expect(observer.observedActors).toEqual([])
  expect(observer.requests).toBe(0)
}
