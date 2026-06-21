const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  resolveBunRuntimeBinary,
  resolveManagedXpodLaunchTarget,
  resolveXpodLaunchTarget,
  resolveXpodRuntimeVersion,
} = require(resolveCompiledDesktopModule('lib/xpod-launch.js'))

const cssImportRewriteRuntimeSource = `
function rewriteConfigForFileUrlImportsIfNeeded() {}
function rewriteConfigImports() {}
pathToFileURL()
`

const provisionAwareXpodBaseConfig = JSON.stringify([
  {
    overrideParameters: {
      '@type': 'ScopedPickWebIdHandler',
      storageBaseUrl: {
        '@id': 'urn:solid-server:default:variable:baseUrl',
        '@type': 'Variable',
      },
      provisionBaseUrl: {
        '@id': 'urn:solid-server:default:variable:oidcIssuer',
        '@type': 'Variable',
      },
    },
  },
  {
    overrideParameters: {
      '@type': 'ProvisionPodCreator',
      provisionBaseUrl: {
        '@id': 'urn:solid-server:default:variable:oidcIssuer',
        '@type': 'Variable',
      },
      nodeId: {
        '@id': 'urn:solid-server:default:variable:nodeId',
        '@type': 'Variable',
      },
    },
  },
])

const provisionOnlyXpodBaseConfig = JSON.stringify([
  {
    overrideParameters: {
      '@type': 'ScopedPickWebIdHandler',
      identityDbUrl: {
        '@id': 'urn:solid-server:default:variable:identityDbUrl',
        '@type': 'Variable',
      },
      provisionBaseUrl: {
        '@id': 'urn:solid-server:default:variable:oidcIssuer',
        '@type': 'Variable',
      },
    },
  },
  {
    overrideParameters: {
      '@type': 'ProvisionPodCreator',
      provisionBaseUrl: {
        '@id': 'urn:solid-server:default:variable:oidcIssuer',
        '@type': 'Variable',
      },
      nodeId: {
        '@id': 'urn:solid-server:default:variable:nodeId',
        '@type': 'Variable',
      },
    },
  },
])

const missingStorageScopeXpodBaseConfig = JSON.stringify([
  {
    overrideParameters: {
      '@type': 'ScopedPickWebIdHandler',
      provisionBaseUrl: {
        '@id': 'urn:solid-server:default:variable:oidcIssuer',
        '@type': 'Variable',
      },
    },
  },
  {
    overrideParameters: {
      '@type': 'ProvisionPodCreator',
      provisionBaseUrl: {
        '@id': 'urn:solid-server:default:variable:oidcIssuer',
        '@type': 'Variable',
      },
      nodeId: {
        '@id': 'urn:solid-server:default:variable:nodeId',
        '@type': 'Variable',
      },
    },
  },
])

const legacyXpodBaseConfig = JSON.stringify([
  {
    overrideParameters: {
      '@type': 'ScopedPickWebIdHandler',
    },
  },
  {
    overrideParameters: {
      '@type': 'ProvisionPodCreator',
    },
  },
])

function readValidRuntimeFile(filePath = '') {
  return filePath.endsWith('/config/xpod.base.json')
    ? provisionAwareXpodBaseConfig
    : cssImportRewriteRuntimeSource
}

test('resolveXpodLaunchTarget ignores sibling xpod source by default in dev', () => {
  const sourceRoot = '/work/xpod'
  const repoRoot = '/work/linx/node_modules/@undefineds.co/xpod'
  const packageBin = `${repoRoot}/bin/xpod.js`
  const target = resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/work/linx/apps/desktop/dist',
    cwd: '/work/linx/apps/desktop',
    env: { PATH: '' },
    existsSync: (filePath) => (
      filePath === `${sourceRoot}/package.json`
      || filePath === `${sourceRoot}/src/main.ts`
      || filePath === `${sourceRoot}/src/identity/oidc/ScopedPickWebIdHandler.ts`
      || filePath === `${sourceRoot}/src/runtime/css-process.ts`
      || filePath === `${sourceRoot}/config/xpod.base.json`
      || filePath === `${repoRoot}/package.json`
      || filePath === `${repoRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`
      || filePath === `${repoRoot}/dist/runtime/css-process.js`
      || filePath === `${repoRoot}/config/xpod.base.json`
      || filePath === packageBin
    ),
    readFileSync: readValidRuntimeFile,
  })

  assert.deepEqual(target, {
    kind: 'package-bin',
    rootDir: repoRoot,
    entryPath: packageBin,
  })
})

test('resolveXpodLaunchTarget resolves nvm Bun when GUI PATH omits nvm', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-nvm-bun-'))
  try {
    const sourceRoot = '/work/xpod'
    const home = path.join(tempRoot, 'home')
    const bunBinary = path.join(home, '.nvm', 'versions', 'node', 'v22.21.1', 'bin', 'bun')
    fs.mkdirSync(path.dirname(bunBinary), { recursive: true })
    fs.writeFileSync(bunBinary, '', 'utf-8')

    const target = resolveXpodLaunchTarget({
      appIsPackaged: false,
      desktopDir: '/work/linx/apps/desktop/dist',
      cwd: '/work/linx/apps/desktop',
      env: {
        LINX_XPOD_DEV_SOURCE: '1',
        HOME: home,
        PATH: '/usr/bin:/bin',
      },
      existsSync: (filePath) => (
        filePath === `${sourceRoot}/package.json`
        || filePath === `${sourceRoot}/src/main.ts`
        || filePath === `${sourceRoot}/src/identity/oidc/ScopedPickWebIdHandler.ts`
        || filePath === `${sourceRoot}/src/runtime/css-process.ts`
        || filePath === `${sourceRoot}/config/xpod.base.json`
        || fs.existsSync(filePath)
      ),
      readFileSync: readValidRuntimeFile,
    })

    assert.equal(target.kind, 'dev-source')
    assert.equal(target.runtimeBinary, bunBinary)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('resolveBunRuntimeBinary prefers explicit binary over PATH and probes', () => {
  assert.equal(resolveBunRuntimeBinary({
    env: {
      LINX_BUN_BINARY: '/custom/bin/bun',
      HOME: '/home/linx',
      PATH: '/usr/local/bin',
    },
    commandExistsSync: (filePath) => filePath === '/custom/bin/bun',
  }), '/custom/bin/bun')
})

test('resolveXpodLaunchTarget can disable sibling xpod source and fall back to package bin', () => {
  const sourceRoot = '/work/xpod'
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
      || filePath === `${repoRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`
      || filePath === `${repoRoot}/dist/runtime/css-process.js`
      || filePath === `${repoRoot}/config/xpod.base.json`
      || filePath === packageBin
    ),
    readFileSync: readValidRuntimeFile,
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
    env: { LINX_XPOD_ROOT: sourceRoot, PATH: '' },
    existsSync: (filePath) => (
      filePath === `${sourceRoot}/package.json`
      || filePath === `${sourceRoot}/src/main.ts`
      || filePath === `${sourceRoot}/src/identity/oidc/ScopedPickWebIdHandler.ts`
      || filePath === `${sourceRoot}/src/runtime/css-process.ts`
      || filePath === `${sourceRoot}/config/xpod.base.json`
    ),
    readFileSync: readValidRuntimeFile,
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
      || filePath === `${packagedRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`
      || filePath === `${packagedRoot}/dist/runtime/css-process.js`
      || filePath === `${packagedRoot}/config/xpod.base.json`
      || filePath === singleFile
    ),
    readFileSync: readValidRuntimeFile,
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
      || filePath === `${repoRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`
      || filePath === `${repoRoot}/dist/runtime/css-process.js`
      || filePath === `${repoRoot}/config/xpod.base.json`
      || filePath === packageBin
    ),
    readFileSync: readValidRuntimeFile,
  })

  assert.deepEqual(target, {
    kind: 'package-bin',
    rootDir: repoRoot,
    entryPath: packageBin,
  })
})

test('resolveManagedXpodLaunchTarget installs with Bun before npm when Bun is compatible', async () => {
  const writes = new Map()
  const mkdirs = []
  const spawns = []
  const progress = []
  const runtimeRoot = '/home/linx/local/runtimes/xpod'
  const entryPath = `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/bin/xpod.js`
  let installed = false

  const target = await resolveManagedXpodLaunchTarget({
    appIsPackaged: true,
    desktopDir: '/Applications/LinX.app/Contents/Resources/app/dist',
    cwd: '/repo',
    env: {
      PATH: '/usr/local/bin',
    },
    resourcesPath: '/Applications/LinX.app/Contents/Resources',
    xpodRuntimeDir: runtimeRoot,
    defaultXpodVersion: '0.3.4',
    commandExistsSync: (filePath) => filePath === '/usr/local/bin/bun' || filePath === entryPath,
    mkdirSync: (dirPath) => mkdirs.push(dirPath),
    writeFileSync: (filePath, content) => writes.set(filePath, content),
    spawnSync: (command, args, options) => {
      spawns.push({ command, args, cwd: options?.cwd, registry: options?.env?.NPM_CONFIG_REGISTRY })
      if (args[0] === '--version') {
        return { status: 0, stdout: '1.3.8\n', stderr: '' }
      }
      installed = true
      return { status: 0, stdout: '', stderr: '' }
    },
    existsSync: (filePath) => {
      if (filePath === entryPath) return installed
      if (installed && filePath === `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/dist/identity/oidc/ScopedPickWebIdHandler.js`) return true
      if (installed && filePath === `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/dist/runtime/css-process.js`) return true
      if (installed && filePath === `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/config/xpod.base.json`) return true
      return false
    },
    readFileSync: readValidRuntimeFile,
    onProgress: (item) => progress.push(item),
    which: (command) => command === 'bun' ? '/usr/local/bin/bun' : null,
  })

  assert.equal(target.kind, 'managed-bun-package')
  assert.equal(target.rootDir, `${runtimeRoot}/0.3.4/bun`)
  assert.equal(target.entryPath, entryPath)
  assert.equal(target.runtimeBinary, '/usr/local/bin/bun')
  assert.equal(mkdirs.includes(`${runtimeRoot}/0.3.4/bun`), true)
  assert.equal(writes.has(`${runtimeRoot}/0.3.4/bun/package.json`), true)
  assert.deepEqual(spawns.map((call) => call.command), ['/usr/local/bin/bun', '/usr/local/bin/bun'])
  assert.deepEqual(spawns[1].args, ['install', '--production', '--omit=optional', '--no-progress'])
  assert.equal(spawns[1].registry, 'https://registry.npmjs.org')
  assert.deepEqual(progress.map((item) => item.phase), [
    'version',
    'check-bun',
    'check-bun',
    'prepare-runtime-cache',
    'install-bun',
    'verify-runtime',
    'runtime-ready',
  ])
})

test('resolveManagedXpodLaunchTarget finds Bun outside GUI PATH for packaged app', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-managed-gui-bun-'))
  try {
    const home = path.join(tempRoot, 'home')
    const runtimeRoot = path.join(tempRoot, 'runtime')
    const bunBinary = path.join(home, '.nvm', 'versions', 'node', 'v22.21.1', 'bin', 'bun')
    const entryPath = `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/bin/xpod.js`
    const spawns = []
    let installed = false
    fs.mkdirSync(path.dirname(bunBinary), { recursive: true })
    fs.writeFileSync(bunBinary, '', 'utf-8')

    const target = await resolveManagedXpodLaunchTarget({
      appIsPackaged: true,
      desktopDir: '/Applications/LinX.app/Contents/Resources/app/dist',
      cwd: '/repo',
      env: {
        HOME: home,
        PATH: '/usr/bin:/bin',
      },
      resourcesPath: '/Applications/LinX.app/Contents/Resources',
      xpodRuntimeDir: runtimeRoot,
      defaultXpodVersion: '0.3.4',
      commandExistsSync: (filePath) => filePath === bunBinary || filePath === entryPath,
      mkdirSync: () => {},
      writeFileSync: () => {},
      spawnSync: (command, args) => {
        spawns.push({ command, args })
        if (args[0] === '--version') {
          return { status: 0, stdout: '1.3.8\n', stderr: '' }
        }
        installed = true
        return { status: 0, stdout: '', stderr: '' }
      },
      existsSync: (filePath) => {
        if (filePath === entryPath) return installed
        if (installed && filePath === `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/dist/identity/oidc/ScopedPickWebIdHandler.js`) return true
        if (installed && filePath === `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/dist/runtime/css-process.js`) return true
        if (installed && filePath === `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/config/xpod.base.json`) return true
        return fs.existsSync(filePath)
      },
      readFileSync: readValidRuntimeFile,
    })

    assert.equal(target.kind, 'managed-bun-package')
    assert.equal(target.runtimeBinary, bunBinary)
    assert.deepEqual(spawns.map((call) => call.command), [bunBinary, bunBinary])
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('resolveManagedXpodLaunchTarget skips old Bun candidates', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-managed-old-bun-'))
  try {
    const home = path.join(tempRoot, 'home')
    const runtimeRoot = path.join(tempRoot, 'runtime')
    const oldBun = path.join(home, '.bun', 'bin', 'bun')
    const newBun = path.join(home, '.nvm', 'versions', 'node', 'v22.21.1', 'bin', 'bun')
    const entryPath = `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/bin/xpod.js`
    const spawns = []
    let installed = false
    fs.mkdirSync(path.dirname(oldBun), { recursive: true })
    fs.mkdirSync(path.dirname(newBun), { recursive: true })
    fs.writeFileSync(oldBun, '', 'utf-8')
    fs.writeFileSync(newBun, '', 'utf-8')

    const target = await resolveManagedXpodLaunchTarget({
      appIsPackaged: true,
      desktopDir: '/Applications/LinX.app/Contents/Resources/app/dist',
      cwd: '/repo',
      env: {
        HOME: home,
        PATH: path.dirname(oldBun),
      },
      resourcesPath: '/Applications/LinX.app/Contents/Resources',
      xpodRuntimeDir: runtimeRoot,
      defaultXpodVersion: '0.3.4',
      commandExistsSync: (filePath) => filePath === oldBun || filePath === newBun || filePath === entryPath,
      mkdirSync: () => {},
      writeFileSync: () => {},
      spawnSync: (command, args) => {
        spawns.push({ command, args })
        if (args[0] === '--version') {
          return { status: 0, stdout: command === oldBun ? '1.2.12\n' : '1.3.8\n', stderr: '' }
        }
        installed = true
        return { status: 0, stdout: '', stderr: '' }
      },
      existsSync: (filePath) => {
        if (filePath === entryPath) return installed
        if (installed && filePath === `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/dist/identity/oidc/ScopedPickWebIdHandler.js`) return true
        if (installed && filePath === `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/dist/runtime/css-process.js`) return true
        if (installed && filePath === `${runtimeRoot}/0.3.4/bun/node_modules/@undefineds.co/xpod/config/xpod.base.json`) return true
        return fs.existsSync(filePath)
      },
      readFileSync: readValidRuntimeFile,
    })

    assert.equal(target.kind, 'managed-bun-package')
    assert.equal(target.runtimeBinary, newBun)
    assert.deepEqual(spawns.map((call) => call.command), [oldBun, newBun, newBun])
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('resolveXpodRuntimeVersion prefers build metadata over stale root package dependency', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-version-'))
  try {
    const repoRoot = path.join(tempRoot, 'repo')
    const desktopCwd = path.join(repoRoot, 'apps', 'desktop')
    fs.mkdirSync(desktopCwd, { recursive: true })
    fs.writeFileSync(
      path.join(repoRoot, 'package.json'),
      JSON.stringify({
        dependencies: {
          '@undefineds.co/xpod': '0.3.6',
        },
      }),
      'utf-8',
    )

    assert.equal(resolveXpodRuntimeVersion({
      cwd: desktopCwd,
      desktopDir: path.join(desktopCwd, 'dist'),
      env: {},
      defaultXpodVersion: '0.3.7',
    }), '0.3.7')

    assert.equal(resolveXpodRuntimeVersion({
      cwd: desktopCwd,
      desktopDir: path.join(desktopCwd, 'dist'),
      env: { LINX_XPOD_VERSION: '0.3.8' },
      defaultXpodVersion: '0.3.7',
    }), '0.3.8')
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('resolveManagedXpodLaunchTarget falls back to npm when Bun is missing', async () => {
  const runtimeRoot = '/home/linx/local/runtimes/xpod'
  const entryPath = `${runtimeRoot}/0.3.4/npm/node_modules/@undefineds.co/xpod/bin/xpod.js`
  const spawns = []
  const progress = []
  let installed = false

  const target = await resolveManagedXpodLaunchTarget({
    appIsPackaged: true,
    desktopDir: '/Applications/LinX.app/Contents/Resources/app/dist',
    cwd: '/repo',
    env: {
      PATH: '/usr/local/bin',
    },
    resourcesPath: '/Applications/LinX.app/Contents/Resources',
    xpodRuntimeDir: runtimeRoot,
    defaultXpodVersion: '0.3.4',
    existsSync: (filePath) => {
      if (filePath === entryPath) return installed
      if (installed && filePath === `${runtimeRoot}/0.3.4/npm/node_modules/@undefineds.co/xpod/dist/identity/oidc/ScopedPickWebIdHandler.js`) return true
      if (installed && filePath === `${runtimeRoot}/0.3.4/npm/node_modules/@undefineds.co/xpod/dist/runtime/css-process.js`) return true
      if (installed && filePath === `${runtimeRoot}/0.3.4/npm/node_modules/@undefineds.co/xpod/config/xpod.base.json`) return true
      return false
    },
    readFileSync: readValidRuntimeFile,
    commandExistsSync: (filePath) => (
      filePath === '/usr/local/bin/node'
      || filePath === '/usr/local/bin/npm'
      || filePath === entryPath
    ),
    mkdirSync: () => {},
    writeFileSync: () => {},
    spawnSync: (command, args, options) => {
      spawns.push({ command, args, cwd: options?.cwd, registry: options?.env?.NPM_CONFIG_REGISTRY })
      if (command === '/usr/local/bin/node' && args[0] === '--version') {
        return { status: 0, stdout: 'v22.21.1\n', stderr: '' }
      }
      installed = true
      return { status: 0, stdout: '', stderr: '' }
    },
    which: (command) => {
      if (command === 'node') return '/usr/local/bin/node'
      if (command === 'npm') return '/usr/local/bin/npm'
      return null
    },
    onProgress: (item) => progress.push(item),
  })

  assert.equal(target.kind, 'managed-node-package')
  assert.equal(target.rootDir, `${runtimeRoot}/0.3.4/npm`)
  assert.equal(target.entryPath, entryPath)
  assert.equal(target.runtimeBinary, '/usr/local/bin/node')
  assert.deepEqual(spawns.map((call) => call.command), ['/usr/local/bin/node', '/usr/local/bin/npm'])
  assert.deepEqual(spawns[1].args, ['install', '--omit=dev', '--omit=optional', '--no-audit', '--no-fund'])
  assert.equal(spawns[1].registry, 'https://registry.npmjs.org')
  assert.deepEqual(progress.map((item) => item.phase), [
    'version',
    'check-bun',
    'check-node',
    'check-node',
    'prepare-runtime-cache',
    'install-npm',
    'verify-runtime',
    'runtime-ready',
  ])
})

test('resolveManagedXpodLaunchTarget uses embedded package only after runtime managers are unavailable', async () => {
  const packagedRoot = '/Applications/LinX.app/Contents/Resources/xpod'
  const packageBin = `${packagedRoot}/bin/xpod.js`

  const target = await resolveManagedXpodLaunchTarget({
    appIsPackaged: true,
    desktopDir: '/Applications/LinX.app/Contents/Resources/app/dist',
    cwd: '/repo',
    env: {
      PATH: '/usr/local/bin',
      LINX_XPOD_VERSION: '0.3.4',
    },
    resourcesPath: '/Applications/LinX.app/Contents/Resources',
    xpodRuntimeDir: '/home/linx/local/runtimes/xpod',
    existsSync: (filePath) => (
      filePath === `${packagedRoot}/package.json`
      || filePath === `${packagedRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`
      || filePath === `${packagedRoot}/dist/runtime/css-process.js`
      || filePath === `${packagedRoot}/config/xpod.base.json`
      || filePath === packageBin
    ),
    readFileSync: readValidRuntimeFile,
    commandExistsSync: () => false,
    which: () => null,
  })

  assert.deepEqual(target, {
    kind: 'package-bin',
    rootDir: packagedRoot,
    entryPath: packageBin,
  })
})

test('resolveManagedXpodLaunchTarget falls back to embedded package when managed install lacks login capabilities', async () => {
  const runtimeRoot = '/home/linx/local/runtimes/xpod'
  const packagedRoot = '/Applications/LinX.app/Contents/Resources/xpod'
  const packageBin = `${packagedRoot}/bin/xpod.js`
  const managedEntry = `${runtimeRoot}/0.3.7/bun/node_modules/@undefineds.co/xpod/bin/xpod.js`
  const progress = []
  let installed = false

  const target = await resolveManagedXpodLaunchTarget({
    appIsPackaged: true,
    desktopDir: '/Applications/LinX.app/Contents/Resources/app/dist',
    cwd: '/repo',
    env: {
      PATH: '/usr/local/bin',
    },
    resourcesPath: '/Applications/LinX.app/Contents/Resources',
    xpodRuntimeDir: runtimeRoot,
    defaultXpodVersion: '0.3.7',
    commandExistsSync: (filePath) => filePath === '/usr/local/bin/bun',
    mkdirSync: () => {},
    writeFileSync: () => {},
    spawnSync: (_command, args) => {
      if (args[0] === '--version') {
        return { status: 0, stdout: '1.3.8\n', stderr: '' }
      }
      installed = true
      return { status: 0, stdout: '', stderr: '' }
    },
    existsSync: (filePath) => {
      if (filePath === managedEntry) return installed
      if (filePath === `${packagedRoot}/package.json`) return true
      if (filePath === `${packagedRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`) return true
      if (filePath === `${packagedRoot}/dist/runtime/css-process.js`) return true
      if (filePath === `${packagedRoot}/config/xpod.base.json`) return true
      if (filePath === packageBin) return true
      return false
    },
    readFileSync: (filePath) => filePath.startsWith(packagedRoot)
      ? readValidRuntimeFile(filePath)
      : '',
    onProgress: (item) => progress.push(item),
    which: (command) => command === 'bun' ? '/usr/local/bin/bun' : null,
  })

  assert.deepEqual(target, {
    kind: 'package-bin',
    rootDir: packagedRoot,
    entryPath: packageBin,
  })
  assert.equal(progress.some((item) => item.label === 'Bun xpod runtime 不可用'), true)
  assert.equal(progress.at(-1).label, '使用内置 xpod runtime')
})

test('resolveXpodLaunchTarget rejects old xpod runtimes without scoped WebID selection', () => {
  const repoRoot = '/repo/node_modules/@undefineds.co/xpod'
  const packageBin = `${repoRoot}/bin/xpod.js`

  assert.throws(() => resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/repo/apps/desktop/dist',
    cwd: '/repo',
    env: {},
    existsSync: (filePath) => (
      filePath === `${repoRoot}/package.json`
      || filePath === packageBin
    ),
  }), /scoped WebID selection/)
})

test('resolveXpodLaunchTarget rejects xpod runtimes without provision-aware CSS config', () => {
  const repoRoot = '/repo/node_modules/@undefineds.co/xpod'
  const packageBin = `${repoRoot}/bin/xpod.js`

  assert.throws(() => resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/repo/apps/desktop/dist',
    cwd: '/repo',
    env: {},
    existsSync: (filePath) => (
      filePath === `${repoRoot}/package.json`
      || filePath === `${repoRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`
      || filePath === `${repoRoot}/config/xpod.base.json`
      || filePath === `${repoRoot}/dist/runtime/css-process.js`
      || filePath === packageBin
    ),
    readFileSync: (filePath) => filePath.endsWith('/config/xpod.base.json')
      ? legacyXpodBaseConfig
      : cssImportRewriteRuntimeSource,
  }), /provision-aware WebID and PodCreator config/)
})

test('resolveXpodLaunchTarget rejects xpod runtimes without storage-scoped WebID config', () => {
  const repoRoot = '/repo/node_modules/@undefineds.co/xpod'
  const packageBin = `${repoRoot}/bin/xpod.js`

  assert.throws(() => resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/repo/apps/desktop/dist',
    cwd: '/repo',
    env: {},
    existsSync: (filePath) => (
      filePath === `${repoRoot}/package.json`
      || filePath === `${repoRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`
      || filePath === `${repoRoot}/config/xpod.base.json`
      || filePath === `${repoRoot}/dist/runtime/css-process.js`
      || filePath === packageBin
    ),
    readFileSync: (filePath) => filePath.endsWith('/config/xpod.base.json')
      ? missingStorageScopeXpodBaseConfig
      : cssImportRewriteRuntimeSource,
  }), /storage-scoped\/provision-aware WebID and PodCreator config/)
})

test('resolveXpodLaunchTarget accepts identity DB scoped WebID config', () => {
  const repoRoot = '/repo/node_modules/@undefineds.co/xpod'
  const packageBin = `${repoRoot}/bin/xpod.js`

  const target = resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/repo/apps/desktop/dist',
    cwd: '/repo',
    env: {},
    existsSync: (filePath) => (
      filePath === `${repoRoot}/package.json`
      || filePath === `${repoRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`
      || filePath === `${repoRoot}/config/xpod.base.json`
      || filePath === `${repoRoot}/dist/runtime/css-process.js`
      || filePath === packageBin
    ),
    readFileSync: (filePath) => filePath.endsWith('/config/xpod.base.json')
      ? provisionOnlyXpodBaseConfig
      : cssImportRewriteRuntimeSource,
  })

  assert.deepEqual(target, {
    kind: 'package-bin',
    rootDir: repoRoot,
    entryPath: packageBin,
  })
})

test('resolveXpodLaunchTarget rejects xpod runtimes without escaped CSS config import support', () => {
  const repoRoot = '/repo/node_modules/@undefineds.co/xpod'
  const packageBin = `${repoRoot}/bin/xpod.js`

  assert.throws(() => resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/repo/apps/desktop/dist',
    cwd: '/repo',
    env: {},
    existsSync: (filePath) => (
      filePath === `${repoRoot}/package.json`
      || filePath === `${repoRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`
      || filePath === `${repoRoot}/config/xpod.base.json`
      || filePath === `${repoRoot}/dist/runtime/css-process.js`
      || filePath === packageBin
    ),
    readFileSync: () => 'function oldRuntime() {}',
  }), /escaped recursive CSS runtime config imports/)
})

test('resolveXpodLaunchTarget accepts package runtimes with escaped CSS config import support', () => {
  const repoRoot = '/repo/node_modules/@undefineds.co/xpod'
  const packageBin = `${repoRoot}/bin/xpod.js`

  const target = resolveXpodLaunchTarget({
    appIsPackaged: false,
    desktopDir: '/repo/apps/desktop/dist',
    cwd: '/repo',
    env: {},
    existsSync: (filePath) => (
      filePath === `${repoRoot}/package.json`
      || filePath === `${repoRoot}/dist/identity/oidc/ScopedPickWebIdHandler.js`
      || filePath === `${repoRoot}/config/xpod.base.json`
      || filePath === packageBin
      || filePath === `${repoRoot}/dist/runtime/css-process.js`
    ),
    readFileSync: readValidRuntimeFile,
  })

  assert.deepEqual(target, {
    kind: 'package-bin',
    rootDir: repoRoot,
    entryPath: packageBin,
  })
})
