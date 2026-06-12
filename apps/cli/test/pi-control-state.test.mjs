import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function createDb(row, options = {}) {
  const calls = []
  return {
    calls,
    resolveLocatorIri(_resource, locator) {
      calls.push({ op: 'resolveLocatorIri', locator })
      return `https://pod.example/.data/sessions/2026/05/21/${locator.id}.ttl`
    },
    async findById(_resource, id) {
      calls.push({ op: 'findById', id })
      if (options.failById) {
        throw new Error('pod unavailable')
      }
      return row
    },
    async findByIri(_resource, iri) {
      calls.push({ op: 'findByIri', iri })
      return row
    },
  }
}

test('hydrateLinxPiControlState reads auto control state from Pod session metadata', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/control-state.ts')
  t.after(() => cleanup())

  const db = createDb({
    id: '2026/05/21/session-1.ttl',
    metadata: {
      controlPlane: {
        linxSession: {
          autoEnabled: true,
          symphonyEnabled: true,
          updatedAt: '2026-05-21T00:00:00.000Z',
          updatedBy: 'app',
        },
      },
    },
  })

  const hydration = await module.hydrateLinxPiControlState({
    db,
    sessionId: 'session-1',
    createdAt: '2026-05-21T00:00:00.000Z',
  })

  assert.deepEqual(hydration.state, { autoEnabled: true, symphonyEnabled: true })
  assert.equal(hydration.result.direction, 'core-to-local')
  assert.equal(hydration.result.plane, 'control-plane')
  assert.equal(hydration.result.authority, 'core')
})

test('hydrateLinxPiControlState returns null state when session metadata is absent', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/control-state.ts')
  t.after(() => cleanup())

  const hydration = await module.hydrateLinxPiControlState({
    db: createDb(null),
    sessionId: 'session-2',
    createdAt: '2026-05-21T00:00:00.000Z',
  })

  assert.equal(hydration.state, null)
  assert.equal(hydration.result.status, 'completed')
})

test('hydrateLinxPiControlState reports failed control-plane sync without throwing', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/control-state.ts')
  t.after(() => cleanup())

  const errors = []
  const hydration = await module.hydrateLinxPiControlState({
    db: createDb(null, { failById: true }),
    sessionId: 'session-3',
    createdAt: '2026-05-21T00:00:00.000Z',
    onError(error) {
      errors.push(error)
    },
  })

  assert.equal(hydration, null)
  assert.equal(errors.length, 1)
})

test('deriveLinxPiStartupControlState restores auto only for resume/last startup', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/control-state.ts')
  t.after(() => cleanup())

  const hydrated = {
    state: {
      autoEnabled: true,
      symphonyEnabled: true,
    },
    result: {
      status: 'completed',
    },
  }

  assert.deepEqual(module.deriveLinxPiStartupControlState({
    hydration: hydrated,
  }), {
    autoEnabled: false,
    symphonyEnabled: true,
  })

  assert.deepEqual(module.deriveLinxPiStartupControlState({
    hydration: hydrated,
    restoreAutoFromHydration: true,
  }), {
    autoEnabled: true,
    symphonyEnabled: true,
  })

  assert.deepEqual(module.deriveLinxPiStartupControlState({
    requestedAuto: true,
    hydration: hydrated,
    restoreAutoFromHydration: false,
  }), {
    autoEnabled: true,
    symphonyEnabled: true,
  })

  assert.deepEqual(module.deriveLinxPiStartupControlState({
    requestedAuto: false,
    hydration: hydrated,
    restoreAutoFromHydration: true,
  }), {
    autoEnabled: false,
    symphonyEnabled: true,
  })
})
