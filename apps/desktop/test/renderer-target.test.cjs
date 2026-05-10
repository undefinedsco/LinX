const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const { resolveRendererTarget } = require(resolveCompiledDesktopModule('lib/renderer-target.js'))

test('resolveRendererTarget prefers explicit desktop web url', () => {
  const target = resolveRendererTarget({
    appIsPackaged: false,
    desktopDir: '/repo/apps/desktop/dist',
    env: {
      LINX_DESKTOP_WEB_URL: 'http://127.0.0.1:4173',
    },
    existsSync: () => false,
  })

  assert.deepEqual(target, {
    kind: 'url',
    target: 'http://127.0.0.1:4173',
  })
})

test('resolveRendererTarget prefers dedicated desktop web dist in local mode', () => {
  const expected = path.resolve('/repo/apps/desktop/dist', '../../web/dist-desktop/index.html')
  const target = resolveRendererTarget({
    appIsPackaged: false,
    desktopDir: '/repo/apps/desktop/dist',
    env: {},
    existsSync: (filePath) => filePath === expected,
  })

  assert.deepEqual(target, {
    kind: 'file',
    target: expected,
  })
})

test('resolveRendererTarget falls back to generic web dist when dedicated desktop dist is missing', () => {
  const fallback = path.resolve('/repo/apps/desktop/dist', '../../web/dist/index.html')
  const target = resolveRendererTarget({
    appIsPackaged: false,
    desktopDir: '/repo/apps/desktop/dist',
    env: {},
    existsSync: (filePath) => filePath === fallback,
  })

  assert.deepEqual(target, {
    kind: 'file',
    target: fallback,
  })
})

test('resolveRendererTarget loads packaged web resource', () => {
  const expected = '/Applications/LinX.app/Contents/Resources/web/index.html'
  const target = resolveRendererTarget({
    appIsPackaged: true,
    desktopDir: '/Applications/LinX.app/Contents/Resources/app/dist',
    resourcesPath: '/Applications/LinX.app/Contents/Resources',
    env: {},
    existsSync: (filePath) => filePath === expected,
  })

  assert.deepEqual(target, {
    kind: 'file',
    target: expected,
  })
})

test('resolveRendererTarget does not fall back to localhost:5173 in local mode', () => {
  assert.throws(
    () => resolveRendererTarget({
      appIsPackaged: false,
      desktopDir: '/repo/apps/desktop/dist',
      env: {},
      existsSync: () => false,
    }),
    /Unable to locate desktop web build/,
  )
})
