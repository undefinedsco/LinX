#!/usr/bin/env node
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LinxPodMirror } from '../apps/cli/dist/lib/linx-pod-mirror.js'
import {
  DEFAULT_SECRETARY_CHAT_ID,
  buildToolAuditId,
} from '../apps/cli/dist/lib/pod-mirror-mapping.js'
import {
  createNativeLinxPodSessionSource,
  createLinxRuntimeSessionManager,
  listLinxRuntimeSessions,
} from '../apps/cli/dist/lib/linx-session-manager.js'
import {
  aiProviderResource,
  approvalResource,
  auditResource,
  chatResource,
  credentialResource,
  drizzle,
  grantResource,
  messageResource,
  sessionResource,
  solidResources,
} from '../apps/cli/dist/lib/models.js'
import {
  buildApprovalResourceUrl,
  buildGrantResourceUrl,
  buildSessionResourceUrl,
} from '../apps/cli/dist/lib/pod-native.js'
import { __podApprovalInternal } from '../apps/cli/dist/lib/auto-mode/pod-approval.js'
import { loadCredentials } from '../apps/cli/dist/lib/credentials-store.js'
import { getDefaultPodDataSession } from '../apps/cli/dist/lib/pod-data-session.js'
import { assertDedicatedProdSmokeAccount } from './prod-smoke-account-guard.mjs'

const runId = `linx-verify-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
const cwd = mkdtempSync(join(tmpdir(), 'linx-verify-cwd-'))
const agentDir = mkdtempSync(join(tmpdir(), 'linx-verify-agent-'))
const recoveryAgentDir = mkdtempSync(join(tmpdir(), 'linx-verify-recovery-agent-'))
let cleanupPodCredential = null
const CLOUD_PREFLIGHT_TIMEOUT_MS = 8_000
const SOLID_AUTH_CREDENTIALS_HINT = '$SOLID_HOME/auth/credentials.json (SOLID_HOME defaults to ~/.solid)'

function podBaseUrl(webId) {
  return webId.replace('/profile/card#me', '').replace(/\/$/, '')
}

async function createPodContext() {
  const session = await getDefaultPodDataSession()
  if (!session) {
    throw new Error(`No LinX/Solid credentials found at ${SOLID_AUTH_CREDENTIALS_HINT}. Run \`linx login\` first.`)
  }

  return {
    session,
    webId: session.webId,
    fetch: session.fetch,
    db: drizzle(session.solidSession, {
      logger: false,
      disableInteropDiscovery: true,
      podUrl: session.podUrl,
      resourcePreparation: 'best-effort',
      schema: solidResources,
    }),
    logout: () => session.close(),
  }
}

function createSessionManager(sessionId) {
  const entries = []
  const sessionFile = join(agentDir, 'sessions', `${sessionId}.jsonl`)
  return {
    getSessionId: () => sessionId,
    getSessionFile: () => sessionFile,
    getSessionName: () => undefined,
    getSessionDir: () => join(agentDir, 'sessions'),
    getCwd: () => cwd,
    getEntries: () => entries,
    appendEntry: (entry) => entries.push(entry),
  }
}

function logStep(message) {
  console.error(`[verify-cli-pod-durable] ${message}`)
}

async function assertHttpReachable(url, label) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLOUD_PREFLIGHT_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    })
    return {
      ok: true,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    }
  } catch (error) {
    const elapsedMs = Date.now() - startedAt
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `LinX Cloud verifier preflight failed: ${label} did not respond within `
      + `${Math.round(CLOUD_PREFLIGHT_TIMEOUT_MS / 1000)}s (${url}). `
      + `Original error after ${elapsedMs}ms: ${message}`,
    )
  } finally {
    clearTimeout(timer)
  }
}

async function assertPodOriginReachable(webId) {
  const origin = new URL(webId).origin
  await assertHttpReachable(`${origin}/service/status`, 'Pod identity service status')
  await assertHttpReachable(`${origin}/.well-known/openid-configuration`, 'Pod OIDC discovery')
  await assertHttpReachable(webId.split('#')[0], 'Pod WebID profile')
}

async function upsertById(db, resource, id, insert, update) {
  const existing = await db.findById(resource, id)
  if (!existing) {
    await db.insert(resource).values(insert).execute()
    return
  }
  await db.updateById(resource, id, update)
}

async function deleteByIdIfExists(db, resource, id) {
  const existing = await db.findById(resource, id)
  if (existing) {
    await db.deleteById(resource, id)
  }
}

function rowIri(row) {
  if (!row || typeof row !== 'object') {
    return undefined
  }
  return row['@id'] || row.subject || row.uri || undefined
}

function uuidV7LikeId(date, suffix = crypto.randomUUID().slice(13)) {
  const millisHex = Math.max(1, date.getTime()).toString(16).padStart(12, '0').slice(-12)
  return `${millisHex.slice(0, 8)}-${millisHex.slice(8, 12)}-7000-8000-${suffix.replace(/-/g, '').slice(0, 12).padEnd(12, '0')}`
}

function dateBucketResourceId(id, createdAt, includeDay = false) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const yyyy = String(date.getUTCFullYear())
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  if (!includeDay) {
    return `${yyyy}/${mm}.ttl#${encodeURIComponent(id)}`
  }
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd}.ttl#${encodeURIComponent(id)}`
}

function podResourceIri(webId, path) {
  const base = `${podBaseUrl(webId).replace(/\/$/, '')}/`
  return new URL(path.replace(/^\/+/, ''), base).toString()
}

async function main() {
  logStep('authenticating')
  const configuredCredentials = loadCredentials()
  if (!configuredCredentials) {
    throw new Error(
      `No LinX/Solid credentials found at ${SOLID_AUTH_CREDENTIALS_HINT}. `
      + 'Run `linx login` with the dedicated smoke account first.',
    )
  }
  assertDedicatedProdSmokeAccount(configuredCredentials.webId, { scriptName: 'scripts/verify-cli-pod-durable.mjs' })
  const context = await createPodContext()
  assertDedicatedProdSmokeAccount(context.webId, { scriptName: 'scripts/verify-cli-pod-durable.mjs' })
  logStep('checking LinX Cloud reachability')
  await assertPodOriginReachable(context.webId)
  const createdAt = new Date()
  const sessionId = uuidV7LikeId(createdAt)
  const sessionManager = createSessionManager(sessionId)
  const userMessage = {
    role: 'user',
    content: [{ type: 'text', text: `verify pod durable ${runId}` }],
    timestamp: createdAt.getTime(),
  }
  sessionManager.appendEntry({
    type: 'message',
    id: 'u1',
    parentId: null,
    timestamp: createdAt.toISOString(),
    message: userMessage,
  })

  const mirror = new LinxPodMirror({
    cwd,
    sessionManager,
    runtime: {
      getPodDataSession: async () => context.session,
      createDb: () => context.db,
    },
    onError(error) {
      throw error
    },
  })
  logStep('writing session/message/audit resources')
  mirror.handleEvent({ type: 'message_end', message: userMessage })
  mirror.handleEvent({
    type: 'tool_execution_start',
    toolCallId: `${runId}-tool`,
    toolName: 'verify-tool',
    args: { runId },
    createdAt,
  })
  await mirror.flush()
  await mirror.close()

  logStep('checking Pod ORM resources')
  const chatUri = context.db.resolveLocatorIri(chatResource, { id: DEFAULT_SECRETARY_CHAT_ID })
  const chatResourceId = context.db.resolveResourceId(chatResource, { id: DEFAULT_SECRETARY_CHAT_ID })
  const auditId = buildToolAuditId(sessionId, `${runId}-tool`, 'tool_execution_started')
  const sessionUri = buildSessionResourceUrl(context.webId, sessionId, createdAt)
  const sessionResourceId = context.db.resolveResourceId(sessionResource, sessionUri)
  const messageResourceId = context.db.resolveResourceId(messageResource, {
    id: `${sessionId}-u1`,
    parent: chatUri,
    chat: chatUri,
    createdAt,
  })
  const auditResourceId = dateBucketResourceId(auditId, createdAt, true)
  const messageUri = context.db.resolveLocatorIri(messageResource, {
    id: `${sessionId}-u1`,
    parent: chatUri,
    chat: chatUri,
    createdAt,
  })

  const [sessionRow, messageRow, auditRow] = await Promise.all([
    context.db.findById(sessionResource, sessionResourceId),
    context.db.findById(messageResource, messageResourceId),
    context.db.findById(auditResource, auditResourceId),
  ])
  const [sessionByResourceId, messageByResourceId, auditByResourceId] = await Promise.all([
    context.db.findById(sessionResource, sessionResourceId),
    context.db.findById(messageResource, messageResourceId),
    context.db.findById(auditResource, auditResourceId),
  ])
  const [sessionByShortId, messageByShortId, auditByShortId] = await Promise.all([
    context.db.findById(sessionResource, sessionId),
    context.db.findById(messageResource, `${sessionId}-u1`),
    context.db.findById(auditResource, auditId),
  ])
  const sessionRowId = String(sessionRow?.id ?? '')
  const sessionRowLocalId = sessionRowId
    .replace(/[#?].*$/, '')
    .split('/')
    .pop()
    ?.replace(/\.ttl$/, '')
  if (!sessionRow || sessionRowLocalId !== sessionId || sessionRow.tool !== 'linx') {
    throw new Error(`session was not read back from Pod ORM: ${sessionId}`)
  }
  const sessionMessageResources = Array.isArray(sessionRow.messageResources)
    ? sessionRow.messageResources
    : sessionRow.metadata?.messageResources
  if (!Array.isArray(sessionMessageResources) || sessionMessageResources.length === 0) {
    throw new Error(`session metadata did not include message resource refs: ${sessionId}`)
  }
  if (sessionRow.chat !== chatUri) {
    throw new Error(`session did not point at the AI Secretary chat resource: ${chatResourceId}`)
  }
  if (!messageRow?.content?.includes(`verify pod durable ${runId}`)) {
    throw new Error(`message was not read back from Pod ORM: ${sessionId}-u1`)
  }
  if (!auditRow || auditRow.action !== 'tool_execution_started' || auditRow.toolName !== 'verify-tool') {
    throw new Error(`audit was not read back from Pod ORM: ${auditId}`)
  }
  if (!sessionByResourceId || sessionByResourceId.tool !== 'linx') {
    throw new Error(`session was not read back from Pod ORM by base-relative id: ${sessionResourceId}`)
  }
  if (!messageByResourceId?.content?.includes(`verify pod durable ${runId}`)) {
    throw new Error(`message was not read back from Pod ORM by base-relative id: ${messageResourceId}`)
  }
  if (!auditByResourceId || auditByResourceId.action !== 'tool_execution_started') {
    throw new Error(`audit was not read back from Pod ORM by base-relative id: ${auditResourceId}`)
  }
  if (!sessionByShortId || sessionByShortId.tool !== 'linx') {
    throw new Error(`session was not read back from Pod ORM by naked id: ${sessionId}`)
  }
  if (!messageByShortId?.content?.includes(`verify pod durable ${runId}`)) {
    throw new Error(`message was not read back from Pod ORM by naked id: ${sessionId}-u1`)
  }
  if (!auditByShortId || auditByShortId.action !== 'tool_execution_started') {
    throw new Error(`audit was not read back from Pod ORM by naked id: ${auditId}`)
  }

  logStep('reading session/message directly from Pod source')
  const source = createNativeLinxPodSessionSource({
    webId: context.webId,
    db: context.db,
    fetch: context.fetch,
  })
  const found = await source.findSession(sessionId, cwd)
  if (!found) {
    throw new Error(`native Pod source could not find ${sessionId}`)
  }
  if (!found.messages?.some((message) => message.content?.includes(`verify pod durable ${runId}`))) {
    throw new Error(`native Pod source did not read back message for ${sessionId}`)
  }

  if (existsSync(join(recoveryAgentDir, 'sessions'))) {
    throw new Error(`recovery cache should start empty: ${recoveryAgentDir}`)
  }
  logStep('listing from Pod into an empty local cache')
  const recoveredList = await listLinxRuntimeSessions(cwd, recoveryAgentDir, {
    podSessionSource: source,
  })
  const recoveredListed = recoveredList.find((session) => session.id === sessionId)
  if (!recoveredListed) {
    throw new Error(`empty-cache list did not recover Pod session ${sessionId}`)
  }
  if (!existsSync(recoveredListed.path)) {
    throw new Error(`empty-cache list did not materialize a local cache file: ${recoveredListed.path}`)
  }
  rmSync(recoveredListed.path, { force: true })
  logStep('resuming from Pod after deleting the materialized cache file')
  const recovered = await createLinxRuntimeSessionManager({
    cwd,
    agentDir: recoveryAgentDir,
    session: sessionId.slice(0, 13),
    podSessionSource: source,
  })
  const recoveredEntries = recovered.getEntries()
  if (!recoveredEntries.some((entry) => JSON.stringify(entry).includes(`verify pod durable ${runId}`))) {
    throw new Error(`empty-cache resume did not read message from Pod for ${sessionId}`)
  }

  logStep('writing inactive auth/credential config resource')
  const credentialId = `${runId}-credential`
  const providerId = `${runId}-provider`
  const credentialUri = context.db.resolveLocatorIri(credentialResource, { id: credentialId })
  const providerUri = context.db.resolveLocatorIri(aiProviderResource, { id: providerId })
  cleanupPodCredential = async () => {
    await Promise.allSettled([
      deleteByIdIfExists(context.db, credentialResource, credentialId),
      deleteByIdIfExists(context.db, aiProviderResource, providerId),
    ])
  }
  await upsertById(context.db, aiProviderResource, providerId, {
    id: providerId,
    baseUrl: 'https://api.example.invalid/v1',
  }, {
    baseUrl: 'https://api.example.invalid/v1',
  })
  await upsertById(context.db, credentialResource, credentialId, {
    id: credentialId,
    provider: providerId,
    service: 'ai',
    status: 'inactive',
    apiKey: `linx-verify-not-a-secret-${runId}`,
    baseUrl: 'https://api.example.invalid/v1',
    label: 'LinX verifier inactive credential',
  }, {
    provider: providerId,
    service: 'ai',
    status: 'inactive',
    apiKey: `linx-verify-not-a-secret-${runId}`,
    baseUrl: 'https://api.example.invalid/v1',
    label: 'LinX verifier inactive credential',
  })
  const credentialRow = await context.db.findById(credentialResource, credentialId)
  if (credentialRow?.apiKey !== `linx-verify-not-a-secret-${runId}`) {
    throw new Error('inactive auth/credential config was not read back from Pod ORM')
  }

  logStep('writing approval/grant/audit resources')
  const store = __podApprovalInternal.createSharedModelRemoteApprovalStore(context.webId, async () => context.db)
  const approvalId = `${runId}-approval`
  const grantId = `${runId}-grant`
  const approvalCreatedAt = new Date('2026-04-02T03:04:06.000Z')
  const grantCreatedAt = new Date('2026-04-02T03:04:07.000Z')
  const approvalAuditCreatedAt = new Date('2026-04-02T03:04:08.000Z')
  const approvalUri = buildApprovalResourceUrl(context.webId, approvalId, approvalCreatedAt)
  const approvalResourceId = context.db.resolveResourceId(approvalResource, approvalUri)
  const grantUri = buildGrantResourceUrl(context.webId, grantId)
  const grantResourceId = context.db.resolveResourceId(grantResource, grantUri)
  const approvalSessionUri = `${podBaseUrl(context.webId)}/.data/chat/linx-auto-mode/index.ttl#${runId}`
  await store.insertApproval({
    id: approvalId,
    session: approvalSessionUri,
    toolCallId: `${runId}-approval-tool`,
    toolName: 'commandExecution',
    target: approvalSessionUri,
    action: 'https://undefineds.co/ns#commandExecution',
    risk: 'medium',
    status: 'pending',
    assignedTo: context.webId,
    policyVersion: 'linx-auto-mode-remote-approval/v1',
    createdAt: approvalCreatedAt,
  })
  await store.insertGrant({
    id: grantId,
    target: approvalSessionUri,
    action: 'https://undefineds.co/ns#commandExecution',
    effect: 'allow',
    riskCeiling: 'medium',
    decisionBy: context.webId,
    decisionRole: 'human',
    onBehalfOf: context.webId,
    createdAt: grantCreatedAt,
  })
  await store.insertAudit({
    id: `${runId}-approval-audit`,
    action: 'approval_requested',
    actor: context.webId,
    actorRole: 'human',
    onBehalfOf: context.webId,
    session: approvalSessionUri,
    toolCallId: `${runId}-approval-tool`,
    approval: approvalUri,
    context: JSON.stringify({ runId }),
    policyVersion: 'linx-auto-mode-remote-approval/v1',
    createdAt: approvalAuditCreatedAt,
  })

  const [approvals, grants, audits] = await Promise.all([
    store.listApprovals(),
    store.listGrants(),
    store.listAudits(),
  ])
  if (!approvals.some((row) => row.id === approvalResourceId && row.status === 'pending')) {
    throw new Error('approval was not read back from Pod')
  }
  const approvalByResourceId = await store.findApproval?.(approvalResourceId)
  if (!approvalByResourceId || approvalByResourceId.status !== 'pending') {
    throw new Error(`approval was not read back from Pod by base-relative id: ${approvalResourceId}`)
  }
  const approvalByShortId = await store.findApproval?.(approvalId)
  if (!approvalByShortId || approvalByShortId.status !== 'pending') {
    throw new Error(`approval was not read back from Pod by naked id: ${approvalId}`)
  }
  await store.updateApproval(approvalId, {
    status: 'approved',
    decisionBy: context.webId,
    decisionRole: 'human',
    resolvedAt: new Date(),
  })
  const approvalUpdatedByShortId = await store.findApproval?.(approvalId)
  if (!approvalUpdatedByShortId || approvalUpdatedByShortId.status !== 'approved') {
    throw new Error(`approval was not updated in Pod by naked id: ${approvalId}`)
  }
  if (!grants.some((row) => row.id === grantResourceId && row.effect === 'allow')) {
    throw new Error('grant was not read back from Pod')
  }
  const approvalAuditResourceId = dateBucketResourceId(`${runId}-approval-audit`, approvalAuditCreatedAt, true)
  if (!audits.some((row) => row.id === approvalAuditResourceId && row.action === 'approval_requested')) {
    throw new Error('approval audit was not read back from Pod')
  }
  console.log(JSON.stringify({
    ok: true,
    runId,
    webId: context.webId,
    resources: {
      sessionUrl: sessionUri,
      chatUrl: chatUri,
      messageUrl: messageUri,
      auditUrl: rowIri(auditRow) ?? auditId,
      approvalUrl: approvalUri,
      grantUrl: grantUri,
      credentialUrl: credentialUri,
      providerUrl: providerUri,
    },
    podReadback: {
      sessionMessages: found.messages.length,
      approvals: approvals.filter((row) => row.id === approvalResourceId).length,
      grants: grants.filter((row) => row.id === grantResourceId).length,
      audits: audits.filter((row) => row.id === approvalAuditResourceId).length,
      credentials: credentialRow?.apiKey === `linx-verify-not-a-secret-${runId}` ? 1 : 0,
    },
    emptyCacheRecovery: {
      listed: recoveredList.filter((session) => session.id === sessionId).length,
      resumedSessionId: recovered.getSessionId(),
      resumedEntries: recoveredEntries.length,
      materializedPath: recovered.getSessionFile(),
    },
    localCacheDir: agentDir,
    recoveryCacheDir: recoveryAgentDir,
  }, null, 2))

  await cleanupPodCredential()
  cleanupPodCredential = null
  await context.logout()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
}).finally(async () => {
  if (cleanupPodCredential) {
    await cleanupPodCredential()
  }
  rmSync(cwd, { recursive: true, force: true })
  rmSync(agentDir, { recursive: true, force: true })
  rmSync(recoveryAgentDir, { recursive: true, force: true })
})
