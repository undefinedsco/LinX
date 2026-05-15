import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('resolvePodToolUrl maps absolute Pod paths through the WebID origin', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-tools.ts')
  t.after(() => cleanup())

  const pod = {
    credentials: { url: 'https://id.undefineds.co/' },
    webId: 'https://id.undefineds.co/alice/profile/card#me',
  }

  assert.equal(
    module.resolvePodToolUrl('/alice/settings/credentials.ttl', pod),
    'https://id.undefineds.co/alice/settings/credentials.ttl',
  )
})

test('resolvePodToolUrl maps relative paths under the user Pod base', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-tools.ts')
  t.after(() => cleanup())

  const pod = {
    credentials: { url: 'https://id.undefineds.co/' },
    webId: 'https://id.undefineds.co/alice/profile/card#me',
  }

  assert.equal(
    module.resolvePodToolUrl('settings/credentials.ttl', pod),
    'https://id.undefineds.co/alice/settings/credentials.ttl',
  )
})

test('resolvePodToolUrl keeps full resource URLs unchanged', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-tools.ts')
  t.after(() => cleanup())

  assert.equal(
    module.resolvePodToolUrl('https://pod.example/alice/settings/credentials.ttl', {
      credentials: { url: 'https://id.undefineds.co/' },
      webId: 'https://id.undefineds.co/alice/profile/card#me',
    }),
    'https://pod.example/alice/settings/credentials.ttl',
  )
})

test('pod_write writes content to the resolved Pod resource URL', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-tools.ts')
  t.after(() => cleanup())

  const writes = []
  const result = await module.executePodWrite({
    path: '/alice/docs/note.md',
    content: '# Note\n',
  }, async () => ({
    credentials: { url: 'https://id.undefineds.co/' },
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    async fetch(url, init) {
      writes.push({
        url,
        method: init?.method,
        contentType: init?.headers?.['Content-Type'],
        body: init?.body,
      })
      return new Response('', { status: 201 })
    },
  }))

  assert.equal(result.isError, undefined)
  assert.deepEqual(writes, [{
    url: 'https://id.undefineds.co/alice/docs/note.md',
    method: 'PUT',
    contentType: 'text/markdown',
    body: '# Note\n',
  }])
})
