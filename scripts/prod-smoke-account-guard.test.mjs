import test from 'node:test'
import assert from 'node:assert/strict'
import { assertDedicatedProdSmokeAccount, getExpectedProdSmokeWebId } from './prod-smoke-account-guard.mjs'

test('getExpectedProdSmokeWebId reads the production smoke env', () => {
  assert.equal(
    getExpectedProdSmokeWebId({ LINX_PROD_SMOKE_WEBID: ' https://id.undefineds.co/smoke/profile/card#me ' }),
    'https://id.undefineds.co/smoke/profile/card#me',
  )
})

test('assertDedicatedProdSmokeAccount refuses undeclared production smoke account', () => {
  assert.throws(
    () => assertDedicatedProdSmokeAccount('https://id.undefineds.co/smoke/profile/card#me', {
      env: {},
      scriptName: 'test-smoke',
    }),
    /Set LINX_PROD_SMOKE_WEBID/,
  )
})

test('assertDedicatedProdSmokeAccount refuses mismatched account', () => {
  assert.throws(
    () => assertDedicatedProdSmokeAccount('https://id.undefineds.co/personal/profile/card#me', {
      env: { LINX_PROD_SMOKE_WEBID: 'https://id.undefineds.co/smoke/profile/card#me' },
      scriptName: 'test-smoke',
    }),
    /logged in as https:\/\/id\.undefineds\.co\/personal\/profile\/card#me/,
  )
})

test('assertDedicatedProdSmokeAccount allows the declared dedicated account', () => {
  assert.doesNotThrow(() => assertDedicatedProdSmokeAccount('https://id.undefineds.co/smoke/profile/card#me', {
    env: { LINX_PROD_SMOKE_WEBID: 'https://id.undefineds.co/smoke/profile/card#me' },
    scriptName: 'test-smoke',
  }))
})

test('assertDedicatedProdSmokeAccount blocks known personal WebIDs even when declared', () => {
  assert.throws(
    () => assertDedicatedProdSmokeAccount('https://id.undefineds.co/ganbb/profile/card#me', {
      env: { LINX_PROD_SMOKE_WEBID: 'https://id.undefineds.co/ganbb/profile/card#me' },
      scriptName: 'test-smoke',
    }),
    /blocked for production smoke/,
  )
})
