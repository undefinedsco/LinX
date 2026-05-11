const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const { getXpodDashboardUrl, formatXpodStatusDetail } = require(resolveCompiledDesktopModule('lib/xpod-ui.js'))

test('getXpodDashboardUrl prefers local url', () => {
  const url = getXpodDashboardUrl({
    localUrl: 'http://localhost:5737/',
    baseUrl: 'https://node-abc123.undefineds.co/',
  })

  assert.equal(url, 'http://localhost:5737/dashboard/')
})

test('formatXpodStatusDetail includes urls and pid', () => {
  const detail = formatXpodStatusDetail({
    running: true,
    status: 'running',
    providerId: 'undefineds',
    port: 5737,
    pid: 12345,
    localUrl: 'http://localhost:5737/',
    baseUrl: 'https://node-abc123.undefineds.co/',
  })

  assert.match(detail, /状态: running/)
  assert.match(detail, /PID: 12345/)
  assert.match(detail, /本地地址: http:\/\/localhost:5737\//)
  assert.match(detail, /公开地址: https:\/\/node-abc123\.undefineds\.co\//)
})
