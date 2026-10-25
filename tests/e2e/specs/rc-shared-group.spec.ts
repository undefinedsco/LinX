import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { fillCustomLoginProvider, getLoginDialog } from '../helpers/login-ui'
import { authorizeSeededRuntime, signInToSeededRuntime, waitForSolidDbReady, type ProviderAccount } from '../helpers/seeded-auth-flow'
import { expectSecretaryVisible } from '../helpers/secretary-bootstrap'

/**
 * RC shared-group acceptance: two real seed identities on the same xpod-rc provider.
 *
 *   LINX_E2E_BASE_URL                    the deployed LinX RC site
 *   LINX_E2E_CLOUD_IDENTITY_URL          https://ids.sealosgzg.site/
 *   LINX_E2E_SHARED_GROUP=1              enables this RC-only check (mandatory in candidate.yml)
 *   LINX_E2E_ACCOUNT_EMAIL/_PASSWORD/_POD          Alice (scripts/rc-provider-seed.mjs)
 *   LINX_E2E_BOB_ACCOUNT_EMAIL/_PASSWORD/_POD      Bob   (same run's seed)
 *   LINX_E2E_BOB_ACCOUNT_WEBID           Bob's seeded CSS WebID, for Alice's 添加朋友 form
 *
 * Both people sign in through the product's own OIDC flow in separate browser
 * contexts. Alice adds Bob as a contact in the UI, creates a group in the UI,
 * invites Bob and sends a message. Bob signs in separately afterwards, must
 * discover the group in his own chat list, open the same conversation, read the
 * original message after a reload, reply, and Alice must receive that reply
 * after a reload of her own page.
 *
 * This is intentionally a mandatory acceptance, not a demonstration: a group
 * written only into Alice's Pod without cross-Pod invite discovery or a Solid
 * ACL grant for Bob is a real product gap and must fail here. There is no
 * API-only room creation, no second local xpod, no shared browser storage, no
 * identity substitution and no direct database/ACL write.
 *
 * Trace, screenshots and video are off for this spec on purpose: the provider
 * sign-in pages carry the per-run seed passwords, so failure artifacts must not
 * retain them. candidate.yml also drops this spec's test-results directory.
 */
test.use({ trace: 'off', screenshot: 'off', video: 'off' })
test.describe.configure({ mode: 'serial', retries: 0 })
test.setTimeout(600_000)

const enabled = process.env.LINX_E2E_SHARED_GROUP === '1'

function requiredEnv(name: string, { trim = true } = {}): string {
  const raw = process.env[name]
  const value = trim ? raw?.trim() : raw
  if (!value) throw new Error(`${name} is required for the RC shared-group acceptance`)
  return value
}

function account(prefix: 'LINX_E2E_ACCOUNT' | 'LINX_E2E_BOB_ACCOUNT'): ProviderAccount {
  return {
    email: requiredEnv(`${prefix}_EMAIL`),
    // A password is an opaque value: only emptiness is checked, never trimmed.
    password: requiredEnv(`${prefix}_PASSWORD`, { trim: false }),
    podName: requiredEnv(`${prefix}_POD`),
    baseUrl: requiredEnv('LINX_E2E_CLOUD_IDENTITY_URL').replace(/\/?$/, '/'),
  }
}

// A local/standalone run must skip explicitly, never pretend to be the shared RC.
test.skip(!enabled, 'shared-group acceptance is RC-only: set LINX_E2E_SHARED_GROUP=1 with both seeded accounts')

if (enabled) {
  // Fail at load time in RC when the seed did not provide both real accounts.
  account('LINX_E2E_ACCOUNT')
  account('LINX_E2E_BOB_ACCOUNT')
  requiredEnv('LINX_E2E_BOB_ACCOUNT_WEBID')
}

const runId = `rc-shared-${Date.now().toString(36)}`
const groupName = `RC 共享验收 ${runId}`
const aliceMessage = `${runId} Alice 原消息：共享房间应把这条消息交给 Bob。`
const bobReply = `${runId} Bob 回复：已经收到原消息。`

/**
 * Sign in without letting helper diagnostics escape: the shared helpers attach
 * cookies/legacy session stores to some failures, and those are credentials.
 * The stage name keeps the failure actionable without printing the page.
 */
async function signInWithSafeFailure(context: BrowserContext, who: ProviderAccount, label: string): Promise<Page> {
  let stage = 'open-login'
  try {
    const page = await context.newPage()
    await page.goto('/')
    await fillCustomLoginProvider(page, who.baseUrl)
    await getLoginDialog(page).getByRole('button', { name: '继续' }).click()
    const providerOrigin = new URL(who.baseUrl).origin
    stage = 'provider-redirect'
    await page.waitForURL((url) => url.origin === providerOrigin, { timeout: 60_000 })
    stage = 'password-sign-in'
    await signInToSeededRuntime(page, who)
    stage = 'consent'
    await authorizeSeededRuntime(page, who)
    stage = 'back-to-app'
    await page.waitForURL((url) => url.origin !== providerOrigin, { timeout: 60_000 })
    stage = 'workspace-ready'
    await expectSecretaryVisible(page, 90_000)
    await waitForSolidDbReady(page)
    return page
  } catch {
    throw new Error(`shared-group acceptance: ${label} real OIDC sign-in failed at ${stage} (browser/session details suppressed)`)
  }
}

async function identity(page: Page): Promise<{ webId: string; podUrl: string }> {
  const value = await page.evaluate(() => {
    const w = window as any
    const db = w.__SOLID_DB__
    return {
      webId: db?.getDialect?.()?.getWebId?.() ?? null,
      podUrl: w.__SOLID_DB_POD_URL__ ?? db?.getDialect?.()?.getPodUrl?.() ?? null,
    }
  })
  if (!value.webId || !value.podUrl) {
    throw new Error('signed-in page did not expose its real WebID and Pod URL')
  }
  return value
}

async function openChat(page: Page): Promise<void> {
  await page.goto('/chat', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('chat-list-header')).toBeVisible({ timeout: 30_000 })
}

async function openContacts(page: Page): Promise<void> {
  await page.goto('/contacts', { waitUntil: 'domcontentloaded' })
  await expect(
    page.getByRole('listbox', { name: '联系人' }).or(page.getByText('还没有联系人')),
  ).toBeVisible({ timeout: 30_000 })
}

/** Alice adds Bob by the WebID the seed actually provisioned for him. */
async function addBobAsContact(page: Page, bobWebId: string): Promise<void> {
  await openContacts(page)
  await page.getByRole('button', { name: '添加朋友、创建助手' }).click()
  await page.getByRole('menuitem', { name: '添加朋友' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: '添加朋友' })
  await dialog.getByLabel('对方的账号').fill(bobWebId)
  await dialog.getByRole('button', { name: '搜索' }).click()
  await expect(dialog.getByRole('button', { name: '添加' })).toBeVisible({ timeout: 30_000 })
  await dialog.getByRole('button', { name: '添加' }).click()
  await expect(dialog, 'adding Bob must close the 添加朋友 dialog only after the contact is persisted').toHaveCount(0, { timeout: 30_000 })
}

/** Alice opens 发起群聊, finds Bob in the real contact list, invites him and creates the group. */
async function completeNativeMatrixGrant(page: Page): Promise<void> {
  const panel = page.getByRole('group', { name: '群聊授权', exact: true })
  if (!await panel.isVisible().catch(() => false)) return
  let native: Page | undefined
  try {
    const [accountPage] = await Promise.all([
      page.context().waitForEvent('page'),
      panel.getByRole('button', { name: '打开账号页', exact: true }).click(),
    ])
    native = accountPage
    const origin = new URL(requiredEnv('LINX_E2E_CLOUD_IDENTITY_URL')).origin
    await native.waitForURL((url) => url.origin === origin, { timeout: 30_000 })
    await native.getByRole('button', { name: /^(新建凭据|New Credential)$/ }).click()
    await native.locator('#account-credential-name').fill(`LinX RC ${runId}`)
    const [response] = await Promise.all([
      native.waitForResponse((result) => result.request().method() === 'POST'
        && new URL(result.url()).origin === origin
        && new URL(result.url()).pathname.includes('/client-credentials/')),
      native.locator('form').filter({ has: native.locator('#account-credential-name') })
        .getByRole('button', { name: /^(创建|Create)$/ }).click(),
    ])
    const credential = await response.json()
    if (!response.ok() || typeof credential.id !== 'string' || !credential.id
      || typeof credential.secret !== 'string' || !credential.secret) {
      throw new Error('native credential creation failed')
    }
    // Both values stay in memory. Never use value-bearing assertions or attach
    // the native page, response, cookies or browser storage to diagnostics.
    await panel.getByRole('button', { name: '改用 ID / Secret', exact: true }).click()
    await panel.getByLabel('Client ID', { exact: true }).fill(credential.id)
    await panel.getByLabel('Client Secret', { exact: true }).fill(credential.secret)
    await panel.getByRole('button', { name: '使用这个凭据', exact: true }).click()
  } catch {
    // Locator failures can echo fill values; replace the original exception.
    throw new Error('shared-group acceptance: native Pod-interface authorization failed (credential details suppressed)')
  } finally {
    await native?.close().catch(() => undefined)
  }
}

async function createGroupWithBob(page: Page, bobSearch: string): Promise<void> {
  await openChat(page)
  await page.getByRole('button', { name: '新建聊天' }).click()
  await page.getByRole('menuitem', { name: '发起群聊' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: '创建群组' })
  await dialog.getByPlaceholder('输入群组名称').fill(groupName)
  await dialog.getByPlaceholder('搜索联系人...').fill(bobSearch)
  const bobOption = dialog.getByRole('checkbox')
  await expect(bobOption, 'the added Bob contact must appear in the group member picker').toHaveCount(1, { timeout: 30_000 })
  await bobOption.click()
  await expect(dialog.getByText(/已选:/)).toContainText(/bob/i)
  await dialog.getByRole('button', { name: '创建群组' }).click()
  // The product may ask for one explicit Pod-interface authorization before it
  // can create the Matrix room. That is the real user gesture, not a test bypass.
  const authorize = dialog.getByRole('button', { name: '授权并创建' })
  if (await authorize.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await authorize.click()
  }
  await page.getByRole('group', { name: '群聊授权', exact: true })
    .waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined)
  await completeNativeMatrixGrant(page)
  await expect(dialog, 'the group must be created through the product UI before Bob can discover it').toHaveCount(0, { timeout: 60_000 })
}

async function sendInSelectedChat(page: Page, body: string): Promise<void> {
  const input = page.getByRole('textbox', { name: '消息' })
  await expect(input).toBeVisible({ timeout: 30_000 })
  await input.fill(body)
  await input.press('Enter')
  await expect(page.locator('[data-role="user"]').filter({ hasText: body })).toBeVisible({ timeout: 60_000 })
}

function chatRow(page: Page, name: string) {
  return page.getByRole('listbox', { name: '聊天' }).getByRole('option').filter({ hasText: name })
}

test('Alice and Bob share one real group through the product UI', async ({ browser }) => {
  const bobWebId = requiredEnv('LINX_E2E_BOB_ACCOUNT_WEBID')
  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  try {
    // Alice: real OIDC login, add Bob by his seeded WebID, create the group in
    // the UI, invite Bob and send the original message.
    const alice = await signInWithSafeFailure(aliceContext, account('LINX_E2E_ACCOUNT'), 'Alice')
    const aliceIdentity = await identity(alice)
    await addBobAsContact(alice, bobWebId)
    await createGroupWithBob(alice, 'bob')
    await expect(chatRow(alice, groupName)).toBeVisible({ timeout: 30_000 })
    await chatRow(alice, groupName).click()
    await sendInSelectedChat(alice, aliceMessage)

    // Bob: a separate browser, his own OIDC session and his own seeded Pod.
    const bob = await signInWithSafeFailure(bobContext, account('LINX_E2E_BOB_ACCOUNT'), 'Bob')
    const bobIdentity = await identity(bob)
    expect(bobIdentity.webId, 'the fixture WebID must be the identity Bob actually signed in as').toBe(bobWebId)
    expect(aliceIdentity.webId, 'Alice and Bob must be genuinely distinct WebIDs').not.toBe(bobIdentity.webId)
    expect(aliceIdentity.podUrl, 'the two seeded accounts start on different Pods').not.toBe(bobIdentity.podUrl)

    await openChat(bob)
    const invitations = bob.getByRole('region', { name: '群聊邀请', exact: true })
    const authorizeInvitations = invitations.getByRole('button', { name: '授权群聊', exact: true })
    if (await authorizeInvitations.isVisible().catch(() => false)) {
      await authorizeInvitations.click()
      await bob.getByRole('group', { name: '群聊授权', exact: true })
        .waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined)
      await completeNativeMatrixGrant(bob)
    }
    await expect(invitations.getByText(groupName, { exact: true }), 'Bob must discover the persisted invitation').toBeVisible({ timeout: 60_000 })
    const acceptInvitation = invitations.getByRole('button', { name: '接受', exact: true })
    await expect(acceptInvitation).toHaveCount(1)
    await acceptInvitation.click()
    await expect(
      chatRow(bob, groupName),
      'Accepting the invitation must make the shared conversation available to Bob',
    ).toBeVisible({ timeout: 60_000 })

    // From here on the group must be the same persisted conversation: reload
    // before reading, then reply as Bob and reload Alice to read the reply.
    await chatRow(bob, groupName).click()
    await expect(bob.locator('[data-role="user"]').filter({ hasText: aliceMessage })).toBeVisible({ timeout: 60_000 })
    await bob.reload({ waitUntil: 'domcontentloaded' })
    await expect(bob.getByTestId('chat-list-header')).toBeVisible({ timeout: 30_000 })
    await expect(chatRow(bob, groupName)).toBeVisible({ timeout: 30_000 })
    await chatRow(bob, groupName).click()
    await expect(bob.locator('[data-role="user"]').filter({ hasText: aliceMessage })).toBeVisible({ timeout: 60_000 })
    await sendInSelectedChat(bob, bobReply)

    await alice.reload({ waitUntil: 'domcontentloaded' })
    await expect(alice.getByTestId('chat-list-header')).toBeVisible({ timeout: 30_000 })
    await expect(chatRow(alice, groupName)).toBeVisible({ timeout: 30_000 })
    await chatRow(alice, groupName).click()
    await expect(alice.locator('[data-role="user"]').filter({ hasText: bobReply })).toBeVisible({ timeout: 60_000 })
  } finally {
    await Promise.allSettled([aliceContext.close(), bobContext.close()])
  }
})
