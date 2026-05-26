const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const desktopRoot = path.resolve(__dirname, '..')
const scriptPath = path.join(desktopRoot, 'scripts', 'prepare-xpod-resource.mjs')

test('prepare-xpod-resource excludes legacy single-file artifacts and source build metadata', (t) => {
  const fixtureRoot = createXpodFixture(t)
  const resourceRoot = createOutputRoot(t)
  writeFile(fixtureRoot, 'dist/xpod-single.cjs', 'huge legacy artifact')
  writeFile(fixtureRoot, 'dist/xpod.single.cjs', 'legacy artifact')
  writeFile(fixtureRoot, 'dist/main.js.map', '{}')
  writeFile(fixtureRoot, 'dist/main.d.ts', 'export {}')
  writeFile(fixtureRoot, 'dist/npm/staged.js', 'staged')
  writeFile(fixtureRoot, 'dist/test-utils/index.js', 'test')
  writeFile(fixtureRoot, 'node_modules/huge-package/index.js', 'dependency')

  const result = runPrepare({
    LINX_DESKTOP_XPOD_RESOURCE_ROOT: fixtureRoot,
    LINX_DESKTOP_XPOD_RESOURCE_OUTPUT_ROOT: resourceRoot,
    LINX_DESKTOP_MAX_XPOD_RESOURCE_MB: '1',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.existsSync(path.join(resourceRoot, 'dist/main.js')), true)
  assert.equal(fs.existsSync(path.join(resourceRoot, 'dist/xpod-single.cjs')), false)
  assert.equal(fs.existsSync(path.join(resourceRoot, 'dist/xpod.single.cjs')), false)
  assert.equal(fs.existsSync(path.join(resourceRoot, 'dist/main.js.map')), false)
  assert.equal(fs.existsSync(path.join(resourceRoot, 'dist/main.d.ts')), false)
  assert.equal(fs.existsSync(path.join(resourceRoot, 'dist/npm/staged.js')), false)
  assert.equal(fs.existsSync(path.join(resourceRoot, 'dist/test-utils/index.js')), false)
  assert.equal(fs.existsSync(path.join(resourceRoot, 'node_modules/huge-package/index.js')), false)
})

test('prepare-xpod-resource fails when copied resource exceeds the release size guard', (t) => {
  const fixtureRoot = createXpodFixture(t)
  const resourceRoot = createOutputRoot(t)
  const result = runPrepare({
    LINX_DESKTOP_XPOD_RESOURCE_ROOT: fixtureRoot,
    LINX_DESKTOP_XPOD_RESOURCE_OUTPUT_ROOT: resourceRoot,
    LINX_DESKTOP_MAX_XPOD_RESOURCE_MB: '0.0001',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /xpod desktop resource is too large/)
})

function createXpodFixture(t) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-resource-fixture-'))
  const fixtureRoot = path.join(tmpRoot, 'xpod')
  fs.mkdirSync(fixtureRoot, { recursive: true })
  writeFile(fixtureRoot, 'package.json', JSON.stringify({ name: '@undefineds.co/xpod', version: '0.0.0-test' }))
  writeFile(fixtureRoot, 'bin/xpod.js', '#!/usr/bin/env node\n')
  writeFile(fixtureRoot, 'dist/main.js', 'console.log("xpod")\n')
  writeFile(fixtureRoot, 'dist/identity/oidc/ScopedPickWebIdHandler.js', 'exports.ScopedPickWebIdHandler = class {}\n')
  writeFile(fixtureRoot, 'config/local.json', '{}\n')
  writeFile(fixtureRoot, 'config/xpod.base.json', '{}\n')
  writeFile(fixtureRoot, 'templates/main.html.ejs', '<html></html>\n')
  writeFile(fixtureRoot, 'static/app/index.html', '<html></html>\n')

  t.after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  return fixtureRoot
}

function createOutputRoot(t) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-resource-output-'))
  const resourceRoot = path.join(tmpRoot, 'xpod-resource')
  t.after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 })
  })
  return resourceRoot
}

function runPrepare(env) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  })
}

function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}
