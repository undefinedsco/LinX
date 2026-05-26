const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const { getTrayPresentation } = require(resolveCompiledDesktopModule('lib/tray-presentation.js'))

test('getTrayPresentation formats running status with port', () => {
  const presentation = getTrayPresentation({
    running: true,
    status: 'running',
    port: 5737,
  })

  assert.deepEqual(presentation, {
    tone: 'running',
    title: 'xpod ●',
    tooltip: 'xpod · 运行 · 5737',
    statusLabel: 'xpod 运行 · 5737',
  })
})

test('getTrayPresentation formats starting status', () => {
  const presentation = getTrayPresentation({
    running: false,
    status: 'starting',
  })

  assert.deepEqual(presentation, {
    tone: 'starting',
    title: 'xpod ◐',
    tooltip: 'xpod · 启动',
    statusLabel: 'xpod 启动',
  })
})

test('getTrayPresentation formats stopped status', () => {
  const presentation = getTrayPresentation({
    running: false,
    status: 'stopped',
  })

  assert.deepEqual(presentation, {
    tone: 'stopped',
    title: 'xpod ○',
    tooltip: 'xpod · 停止',
    statusLabel: 'xpod 停止',
  })
})
