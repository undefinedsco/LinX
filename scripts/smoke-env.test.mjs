import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSmokeBaseUrl,
  getSmokeModel,
  getSmokePrompt,
  getSmokeTimeoutMs,
  shouldRunLiveSmoke,
} from './smoke-env.mjs'

test('shouldRunLiveSmoke uses one comma-separated LINX_SMOKE_LIVE gate', () => {
  assert.equal(shouldRunLiveSmoke('acp', {}), false)
  assert.equal(shouldRunLiveSmoke('acp', { LINX_SMOKE_LIVE: 'acp,openrouter' }), true)
  assert.equal(shouldRunLiveSmoke('openrouter', { LINX_SMOKE_LIVE: 'acp, openrouter' }), true)
  assert.equal(shouldRunLiveSmoke('openrouter', { LINX_SMOKE_LIVE: 'all' }), true)
  assert.equal(shouldRunLiveSmoke('claude', { LINX_SMOKE_LIVE: 'acp,openrouter' }), false)
})

test('smoke prompt and timeout use shared env names', () => {
  assert.equal(getSmokePrompt('default prompt', {}), 'default prompt')
  assert.equal(getSmokePrompt('default prompt', { LINX_SMOKE_PROMPT: '  custom prompt  ' }), 'custom prompt')
  assert.equal(getSmokeTimeoutMs(1000, {}), 1000)
  assert.equal(getSmokeTimeoutMs(1000, { LINX_SMOKE_TIMEOUT_MS: '2500' }), 2500)
  assert.equal(getSmokeTimeoutMs(1000, { LINX_SMOKE_TIMEOUT_MS: 'bad' }), 1000)
})

test('smoke models and base urls are keyed by backend in one env value', () => {
  assert.equal(
    getSmokeModel('codex', { LINX_SMOKE_MODELS: 'codex=gpt-5.5,claude=haiku,openrouter=meta/free' }),
    'gpt-5.5',
  )
  assert.equal(
    getSmokeModel('claude', { LINX_SMOKE_MODELS: '{"codex":"gpt-5.5","claude":"haiku"}' }),
    'haiku',
  )
  assert.equal(getSmokeModel('codebuddy', { LINX_SMOKE_MODELS: 'codex=gpt-5.5' }), undefined)
  assert.equal(
    getSmokeBaseUrl('openrouter', 'https://default.example/v1', {
      LINX_SMOKE_BASE_URLS: 'openrouter=https://openrouter.ai/api/v1',
    }),
    'https://openrouter.ai/api/v1',
  )
})
