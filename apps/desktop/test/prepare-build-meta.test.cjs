const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const desktopRoot = path.resolve(__dirname, '..')
const scriptPath = path.join(desktopRoot, 'scripts', 'prepare-build-meta.mjs')
const outputPath = path.join(desktopRoot, 'src/generated/build-meta.json')
const resourcePackagePath = path.join(desktopRoot, 'build/xpod-resource/package.json')

test('prepare-build-meta records the declared xpod dependency version by default', (t) => {
  const originalOutput = readOptional(outputPath)
  const originalResourcePackage = readOptional(resourcePackagePath)

  t.after(() => {
    restoreOptional(outputPath, originalOutput)
    restoreOptional(resourcePackagePath, originalResourcePackage)
  })

  fs.mkdirSync(path.dirname(resourcePackagePath), { recursive: true })
  fs.writeFileSync(resourcePackagePath, JSON.stringify({ name: '@undefineds.co/xpod', version: '9.8.7' }))

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      LINX_APP_VERSION: '1.2.3',
    },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  const meta = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  assert.equal(meta.version, '1.2.3')
  assert.equal(meta.xpodVersion, '0.3.32')
})

test('prepare-build-meta can record a local packaged xpod resource version for explicit experiments', (t) => {
  const originalOutput = readOptional(outputPath)
  const originalResourcePackage = readOptional(resourcePackagePath)

  t.after(() => {
    restoreOptional(outputPath, originalOutput)
    restoreOptional(resourcePackagePath, originalResourcePackage)
  })

  fs.mkdirSync(path.dirname(resourcePackagePath), { recursive: true })
  fs.writeFileSync(resourcePackagePath, JSON.stringify({ name: '@undefineds.co/xpod', version: '9.8.7' }))

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      LINX_APP_VERSION: '1.2.3',
      LINX_DESKTOP_USE_XPOD_RESOURCE_VERSION: '1',
    },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  const meta = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  assert.equal(meta.version, '1.2.3')
  assert.equal(meta.xpodVersion, '9.8.7')
})

function readOptional(filePath) {
  try {
    return fs.readFileSync(filePath)
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function restoreOptional(filePath, content) {
  if (content === null) {
    fs.rmSync(filePath, { force: true })
    return
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}
