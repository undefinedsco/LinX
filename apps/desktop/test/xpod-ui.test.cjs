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

test('formatXpodStatusDetail summarizes user-facing readiness without runtime internals', () => {
  const detail = formatXpodStatusDetail({
    running: true,
    status: 'running',
    providerId: 'undefineds',
    port: 5737,
    pid: 12345,
    localUrl: 'http://localhost:5737/',
    baseUrl: 'https://node-abc123.undefineds.co/',
  })

  assert.match(detail, /状态: 运行中/)
  assert.match(detail, /本机入口: 已准备/)
  assert.match(detail, /外网入口: 已配置/)
  assert.doesNotMatch(detail, /PID|12345|localhost:5737|node-abc123\.undefineds\.co/)
})
