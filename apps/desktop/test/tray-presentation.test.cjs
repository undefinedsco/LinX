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
    tooltip: 'LinX · Pod 运行中 · 5737',
    statusLabel: 'Pod 运行中 · 5737',
  })
})

test('getTrayPresentation formats starting status', () => {
  const presentation = getTrayPresentation({
    running: false,
    status: 'starting',
  })

  assert.deepEqual(presentation, {
    tone: 'starting',
    tooltip: 'LinX · Pod 启动中',
    statusLabel: 'Pod 启动中',
  })
})

test('getTrayPresentation formats stopped status', () => {
  const presentation = getTrayPresentation({
    running: false,
    status: 'stopped',
  })

  assert.deepEqual(presentation, {
    tone: 'stopped',
    tooltip: 'LinX · Pod 已停止',
    statusLabel: 'Pod 已停止',
  })
})
