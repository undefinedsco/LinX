import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('pod native helpers live in a Pod core module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-native.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.buildChatIndexResourceUrl, 'function')
  assert.equal(typeof module.upsertManagedTurtleBlock, 'function')
  assert.equal(typeof module.parseManagedTurtleBlocks, 'function')
})

test('pod native URL helpers keep chat and message resources under chat storage', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-native.ts')
  t.after(() => cleanup())

  const webId = 'https://id.undefineds.co/alice/profile/card#me'
  const createdAt = new Date('2026-05-18T01:02:03.000Z')

  assert.equal(
    module.buildChatIndexResourceUrl(webId, 'chat-1'),
    'https://id.undefineds.co/alice/.data/chat/chat-1/index.ttl',
  )
  assert.equal(
    module.buildMessageResourceUrl(webId, 'chat-1', 'thread-1', createdAt),
    'https://id.undefineds.co/alice/.data/chat/chat-1/2026/05/18/messages.ttl',
  )
})

test('pod native URL helpers keep autonomy grants under Pod root settings', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-native.ts')
  t.after(() => cleanup())

  assert.equal(
    module.buildGrantResourceUrl('https://id.undefineds.co/alice/profile/card#me', 'grant-1'),
    'https://id.undefineds.co/alice/settings/autonomy/grants/grant-1.ttl',
  )
})
