const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  assertPackagedXpodRuntime,
  copyXpodRuntimeNodeModules,
} = require('../scripts/xpod-packaged-resource.cjs')

test('copyXpodRuntimeNodeModules restores runtime deps that electron-builder skips', (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-packaged-xpod-'))
  const sourceRoot = path.join(tmpRoot, 'source')
  const targetRoot = path.join(tmpRoot, 'target')
  t.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  writeJson(sourceRoot, 'package.json', {
    name: '@undefineds.co/xpod',
    version: '0.0.0-test',
  })
  writeJson(sourceRoot, 'node_modules/jsonld/package.json', {
    name: 'jsonld',
    version: '0.0.0-test',
    dependencies: {
      canonicalize: '0.0.0-test',
    },
  })
  writeFile(sourceRoot, 'node_modules/jsonld/lib/index.js', 'module.exports = {}\n')
  writeJson(sourceRoot, 'node_modules/canonicalize/package.json', {
    name: 'canonicalize',
    version: '0.0.0-test',
  })
  writeFile(sourceRoot, 'node_modules/canonicalize/lib/index.js', 'module.exports = {}\n')
  writeJson(targetRoot, 'package.json', {
    name: '@undefineds.co/xpod',
    version: '0.0.0-test',
  })

  copyXpodRuntimeNodeModules({ sourceRoot, targetRoot })

  assert.equal(fs.existsSync(path.join(targetRoot, 'node_modules/jsonld/package.json')), true)
  assert.equal(fs.existsSync(path.join(targetRoot, 'node_modules/canonicalize/package.json')), true)
  assert.doesNotThrow(() => assertPackagedXpodRuntime({ root: targetRoot }))
})

test('assertPackagedXpodRuntime fails fast when jsonld is missing', (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-packaged-xpod-missing-'))
  t.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  writeJson(tmpRoot, 'package.json', {
    name: '@undefineds.co/xpod',
    version: '0.0.0-test',
  })

  assert.throws(
    () => assertPackagedXpodRuntime({ root: tmpRoot }),
    /Packaged xpod runtime is incomplete/,
  )
})

function writeJson(root, relativePath, value) {
  writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`)
}

function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}
