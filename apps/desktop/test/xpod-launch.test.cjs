const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const { resolveXpodLaunchTarget } = require(resolveCompiledDesktopModule('lib/xpod-launch.js'))

test('resolveXpodLaunchTarget prefers sibling xpod-cli source by default in dev', () => {
  const sourceRoot = '/work/xpod-cli'
  const target = resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/work/linx/apps/desktop/dist',
    cwd: '/work/linx/apps/desktop',
    env: {},
    existsSync: (filePath) => (
      filePath === `${sourceRoot}/package.json`
      || filePath === `${sourceRoot}/src/main.ts`
    ),
  })

  assert.deepEqual(target, {
    kind: 'dev-source',
    rootDir: sourceRoot,
    entryPath: `${sourceRoot}/src/main.ts`,
  })
})

test('resolveXpodLaunchTarget can disable sibling xpod-cli source and fall back to package bin', () => {
  const sourceRoot = '/work/xpod-cli'
  const repoRoot = '/work/linx/node_modules/@undefineds.co/xpod'
  const packageBin = `${repoRoot}/bin/xpod.js`
  const target = resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/work/linx/apps/desktop/dist',
    cwd: '/work/linx/apps/desktop',
    env: { LINX_XPOD_DEV_SOURCE: '0' },
    existsSync: (filePath) => (
      filePath === `${sourceRoot}/package.json`
      || filePath === `${sourceRoot}/src/main.ts`
      || filePath === `${repoRoot}/package.json`
      || filePath === packageBin
    ),
  })

  assert.deepEqual(target, {
    kind: 'package-bin',
    rootDir: repoRoot,
    entryPath: packageBin,
  })
})

test('resolveXpodLaunchTarget honors explicit LINX_XPOD_ROOT source path', () => {
  const sourceRoot = '/custom/xpod'
  const target = resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/work/linx/apps/desktop/dist',
    cwd: '/work/linx',
    env: { LINX_XPOD_ROOT: sourceRoot },
    existsSync: (filePath) => (
      filePath === `${sourceRoot}/package.json`
      || filePath === `${sourceRoot}/src/main.ts`
    ),
  })

  assert.deepEqual(target, {
    kind: 'dev-source',
    rootDir: sourceRoot,
    entryPath: `${sourceRoot}/src/main.ts`,
  })
})

test('resolveXpodLaunchTarget prefers packaged single-file runtime when present', () => {
  const packagedRoot = '/Applications/LinX.app/Contents/Resources/xpod'
  const singleFile = `${packagedRoot}/dist/xpod-single.cjs`

  const target = resolveXpodLaunchTarget({
    appIsPackaged: true,
    desktopDir: '/Applications/LinX.app/Contents/Resources/app/dist',
    resourcesPath: '/Applications/LinX.app/Contents/Resources',
    env: {},
    existsSync: (filePath) => (
      filePath === `${packagedRoot}/package.json`
      || filePath === singleFile
    ),
  })

  assert.deepEqual(target, {
    kind: 'single-file',
    rootDir: packagedRoot,
    entryPath: singleFile,
  })
})

test('resolveXpodLaunchTarget falls back to package bin in repo installs', () => {
  const repoRoot = '/repo/node_modules/@undefineds.co/xpod'
  const packageBin = `${repoRoot}/bin/xpod.js`

  const target = resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/repo/apps/desktop/dist',
    cwd: '/repo',
    env: {},
    existsSync: (filePath) => (
      filePath === `${repoRoot}/package.json`
      || filePath === packageBin
    ),
  })

  assert.deepEqual(target, {
    kind: 'package-bin',
    rootDir: repoRoot,
    entryPath: packageBin,
  })
})
