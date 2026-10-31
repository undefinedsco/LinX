import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  createOidcApprovalGuard,
  isAccountOidcConsentUrl,
  oidcApprovalLimitMessage,
  summarizeSeededLoginFailure,
} from './oidc-consent-guard.ts'

const PROVIDER = 'https://ids.example/'

test('one visible OIDC approval on the scoped provider passes', () => {
  const guard = createOidcApprovalGuard({ providerOrigin: PROVIDER, maxApprovalActions: 1 })
  assert.equal(guard.beforeApproval('https://ids.example/.account/interaction/first/oidc/consent/'), 1)
})

test('a second approval on a later interaction fails before the click', () => {
  const guard = createOidcApprovalGuard({ providerOrigin: PROVIDER, maxApprovalActions: 1 })
  assert.equal(guard.beforeApproval('https://ids.example/.account/interaction/first/oidc/consent/'), 1)
  assert.throws(
    () => guard.beforeApproval('https://ids.example/.account/interaction/second/oidc/consent/'),
    new RegExp(oidcApprovalLimitMessage(2, 1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  )
  assert.equal(guard.count, 1, 'the rejected action must not be counted as approved')
  assert.throws(
    () => guard.beforeApproval('https://ids.example/.account/interaction/second/oidc/consent/'),
    (error) => !String(error?.message).includes('https://') && !String(error?.message).includes('second'),
  )
})

test('the guard also counts the older non-interaction consent route', () => {
  const guard = createOidcApprovalGuard({ providerOrigin: PROVIDER, maxApprovalActions: 1 })
  assert.equal(guard.beforeApproval('https://ids.example/.account/oidc/consent/'), 1)
})

test('foreign authority and non-OIDC paths never count toward the approval cap', () => {
  const guard = createOidcApprovalGuard({ providerOrigin: PROVIDER, maxApprovalActions: 1 })
  assert.equal(isAccountOidcConsentUrl('https://ids.example/.account/account/', PROVIDER), false)
  assert.equal(isAccountOidcConsentUrl('https://ids.example/pod/oidc/consent/', PROVIDER), false)
  assert.equal(isAccountOidcConsentUrl('https://app.example/.account/interaction/a/oidc/consent/', PROVIDER), false)
  assert.equal(isAccountOidcConsentUrl('https://ids.example.evil/.account/oidc/consent/', PROVIDER), false)
  for (const url of [
    'https://app.example/.account/interaction/a/oidc/consent/',
    'https://ids.example/.account/account/',
    'https://ids.example/pod/oidc/consent/',
    'https://ids.example/.account/interaction/a/oidc/pick-webid/',
  ]) {
    assert.equal(guard.beforeApproval(url), 0, url)
  }
})

test('an unset cap preserves the generic flow', () => {
  const guard = createOidcApprovalGuard({ providerOrigin: PROVIDER })
  assert.equal(guard.beforeApproval('https://ids.example/.account/interaction/a/oidc/consent/'), 1)
  assert.equal(guard.beforeApproval('https://ids.example/.account/interaction/b/oidc/consent/'), 2)
  assert.equal(guard.max, undefined)
})

test('a malformed cap is rejected instead of silently capping', () => {
  assert.throws(() => createOidcApprovalGuard({ providerOrigin: PROVIDER, maxApprovalActions: -1 }), /non-negative integer/)
  assert.throws(() => createOidcApprovalGuard({ providerOrigin: PROVIDER, maxApprovalActions: 1.5 }), /non-negative integer/)
})


test('failure diagnostics expose only safe metadata, never arbitrary error/storage text', () => {
  const leaky = {
    url: 'https://app.example/auth/callback?code=oauth-code&state=oauth-state#fragment',
    title: 'LinX',
    dbError: 'failed with Bearer sk-live-0123456789abcdef and client_secret=topsecret',
    dbPodUrl: 'https://user:pass@pod.example/alice/?token=leak#x',
    dbReady: true,
    dbStatus: 'error',
    dbAuthFetchReady: false,
    currentSessionReady: false,
    loginStore: { state: { storedAccount: { webId: 'https://pod.example/alice/profile/card#me' } } },
    cookieNames: ['session', 'DPoP'],
    localStorageKeys: ['solidClientAuthn:currentSession'],
  }
  const summary = summarizeSeededLoginFailure(leaky)
  const serialized = JSON.stringify(summary)
  for (const secret of ['sk-live-0123456789abcdef', 'topsecret', 'oauth-code', 'oauth-state', 'user:pass', 'token=leak', 'fragment']) {
    assert.ok(!serialized.includes(secret), `diagnostics must not contain ${secret}`)
  }
  assert.equal(summary.dbError, '[error-present]')
  assert.equal(summary.url, 'https://app.example/auth/callback')
  assert.equal(summary.dbPodUrl, 'https://pod.example/alice/')
  assert.equal(summary.storedAccountWebId, 'https://pod.example/alice/profile/card#me')
  assert.equal(summary.currentSessionReady, false)
  assert.equal(summary.dbAuthFetchReady, false)
  assert.equal(summary.dbReady, true)
  assert.equal(summary.dbStatus, 'error')
})

test('successful diagnostics keep dbError null so existing assertions stay meaningful', () => {
  const summary = summarizeSeededLoginFailure({
    url: 'https://app.example/chat',
    title: 'LinX',
    dbReady: true,
    dbStatus: 'ready',
    dbError: null,
    dbPodUrl: 'https://pod.example/alice/',
    dbAuthFetchReady: true,
    currentSessionReady: true,
    loginStore: { state: { storedAccount: { webId: 'https://pod.example/alice/profile/card#me' } } },
  })
  assert.equal(summary.dbError, null)
  assert.equal(summary.dbStatus, 'ready')
  assert.equal(summary.storedAccountWebId, 'https://pod.example/alice/profile/card#me')
})

test('candidate.yml enables the fresh single-consent gate only on the RC signed-in step', () => {
  const workflow = readFileSync(path.resolve(import.meta.dirname, '../../../.github/workflows/candidate.yml'), 'utf8')
  const start = workflow.indexOf('      - name: Signed-in acceptance (xpod RC seed account)')
  assert.ok(start >= 0, 'the RC signed-in acceptance step must exist')
  const nextStep = workflow.indexOf('\n      - name:', start + 1)
  const step = workflow.slice(start, nextStep < 0 ? undefined : nextStep)
  assert.match(step, /LINX_E2E_EXPECT_SINGLE_OIDC_CONSENT: '1'/)
  assert.match(step, /LINX_E2E_LOGIN_VIA: custom/)
  assert.equal(workflow.split('LINX_E2E_EXPECT_SINGLE_OIDC_CONSENT').length - 1, 1, 'the gate stays scoped to that one step')
})
