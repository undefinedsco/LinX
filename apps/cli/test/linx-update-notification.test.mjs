import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('update notification module owns selector rendering and changelog action', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-update-notification.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const openedUrls = []
  const statuses = []
  const interactive = {
    chatContainer: { addChild() {} },
    ui: { requestRender() {} },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return { value: 'Open changelog' }
    },
    openExternal(url) {
      openedUrls.push(url)
    },
    showStatus(message) {
      statuses.push(message)
    },
  }

  module.installLinxUpdateNotification(interactive)
  interactive.showNewVersionNotification({ version: ' 0.3.99 ' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX update available/)
  assert.match(selectorCalls[0].title, /latest 0\.3\.99/)
  assert.deepEqual(selectorCalls[0].options, ['Later', 'Install update and restart', 'Open changelog'])
  assert.equal(openedUrls[0], 'https://github.com/undefineds-co/linx-cli/releases')
  assert.equal(statuses.some((message) => message.includes('Opened LinX changelog for 0.3.99')), true)
})

test('manual update check waits for selector handling before returning', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-update-notification.ts')
  t.after(() => cleanup())

  const previousOffline = process.env.PI_OFFLINE
  const previousFetch = globalThis.fetch
  delete process.env.PI_OFFLINE
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { version: '0.3.99' }
    },
  })
  t.after(() => {
    if (previousOffline === undefined) {
      delete process.env.PI_OFFLINE
    } else {
      process.env.PI_OFFLINE = previousOffline
    }
    globalThis.fetch = previousFetch
  })

  let resolveSelector
  let updateSettled = false
  const interactive = {
    chatContainer: { addChild() {} },
    ui: { requestRender() {} },
    showExtensionSelector() {
      return new Promise((resolve) => {
        resolveSelector = () => resolve('Later')
      })
    },
    showStatus() {},
  }

  const update = module.checkAndShowLinxUpdate(interactive, { manual: true })
    .then(() => {
      updateSettled = true
    })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(updateSettled, false)

  resolveSelector()
  await update
  assert.equal(updateSettled, true)
})

test('update notification module defers and replays while auth UI owns the selector', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-update-notification.ts')
  t.after(() => cleanup())

  let defer = true
  const selectorCalls = []
  const statuses = []
  const interactive = {
    chatContainer: { addChild() {} },
    ui: { requestRender() {} },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return 'Later'
    },
    showStatus(message) {
      statuses.push(message)
    },
  }

  module.installLinxUpdateNotification(interactive, { shouldDefer: () => defer })
  interactive.showNewVersionNotification({ version: '0.3.100' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selectorCalls.length, 0)

  defer = false
  module.replayDeferredLinxUpdateNotification(interactive, { shouldDefer: () => defer })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /latest 0\.3\.100/)
  assert.equal(statuses.some((message) => message.includes('Skipped LinX 0.3.100 for now.')), true)
})

test('background update notification selector failures are reported without unhandled rejection', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-update-notification.ts')
  t.after(() => cleanup())

  const errors = []
  const unhandled = []
  const onUnhandled = (reason) => {
    unhandled.push(reason)
  }
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))

  const interactive = {
    chatContainer: { addChild() {} },
    ui: { requestRender() {} },
    async showExtensionSelector() {
      throw new Error('selector unavailable')
    },
    showError(message) {
      errors.push(message)
    },
  }

  module.installLinxUpdateNotification(interactive)
  interactive.showNewVersionNotification({ version: '0.3.101' })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(unhandled, [])
  assert.deepEqual(errors, ['LinX update failed: selector unavailable'])
})

test('deferred update replay selector failures are reported without unhandled rejection', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-update-notification.ts')
  t.after(() => cleanup())

  const errors = []
  const unhandled = []
  const onUnhandled = (reason) => {
    unhandled.push(reason)
  }
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))

  let defer = true
  const interactive = {
    chatContainer: { addChild() {} },
    ui: { requestRender() {} },
    async showExtensionSelector() {
      throw new Error('replay selector unavailable')
    },
    showError(message) {
      errors.push(message)
    },
  }

  module.installLinxUpdateNotification(interactive, { shouldDefer: () => defer })
  interactive.showNewVersionNotification({ version: '0.3.102' })
  await new Promise((resolve) => setImmediate(resolve))

  defer = false
  module.replayDeferredLinxUpdateNotification(interactive, { shouldDefer: () => defer })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(unhandled, [])
  assert.deepEqual(errors, ['LinX update failed: replay selector unavailable'])
})
