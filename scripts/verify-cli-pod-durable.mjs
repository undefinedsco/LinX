#!/usr/bin/env node
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LinxPiPodMirror } from '../apps/cli/dist/lib/pi-adapter/pod-mirror.js'
import {
  DEFAULT_SECRETARY_CHAT_ID,
  buildToolAuditId,
} from '../apps/cli/dist/lib/pi-adapter/pod-mirror-mapping.js'
import {
  createNativeLinxPiPodSessionSource,
  createLinxPiSessionManager,
  listLinxPiSessions,
} from '../apps/cli/dist/lib/pi-adapter/session.js'
import {
  aiProviderTable,
  approvalResource,
  auditResource,
  chatTable,
  credentialTable,
  drizzle,
  grantResource,
  inboxNotificationTable,
  initSolidTables,
  messageTable,
  sessionTable,
  solidSchema,
} from '../apps/cli/dist/lib/models.js'
import { __podApprovalInternal } from '../apps/cli/dist/lib/watch/pod-approval.js'
import { getDefaultPodDataSession } from '../apps/cli/dist/lib/pod-data-session.js'

const runId = `linx-verify-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
const cwd = mkdtempSync(join(tmpdir(), 'linx-verify-cwd-'))
const agentDir = mkdtempSync(join(tmpdir(), 'linx-verify-agent-'))
const recoveryAgentDir = mkdtempSync(join(tmpdir(), 'linx-verify-recovery-agent-'))
let cleanupPodCredential = null

function podBaseUrl(webId) {
  return webId.replace('/profile/card#me', '').replace(/\/$/, '')
}

async function createPodContext() {
  const session = await getDefaultPodDataSession()
  if (!session) {
    throw new Error('No ~/.linx credentials found. Run `linx login` first.')
  }

  return {
    session,
    webId: session.webId,
    fetch: session.fetch,
    db: drizzle(session.solidSession, {
      logger: false,
      disableInteropDiscovery: true,
      schema: solidSchema,
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

async function upsertByLocator(db, table, locator, insert, update) {
  const existing = await db.findByLocator(table, locator)
  if (!existing) {
    await db.insert(table).values(insert).execute()
    return
  }
  await db.updateByLocator(table, locator, update)
}

async function deleteByLocatorIfExists(db, table, locator) {
  const existing = await db.findByLocator(table, locator)
  if (existing) {
    await db.deleteByLocator(table, locator)
  }
}

function rowIri(row) {
  if (!row || typeof row !== 'object') {
    return undefined
  }
  return row['@id'] || row.subject || row.uri || undefined
}

async function main() {
  logStep('authenticating')
  const context = await createPodContext()
  await initSolidTables(context.db, [
    approvalResource,
    auditResource,
    chatTable,
    credentialTable,
    grantResource,
    inboxNotificationTable,
    messageTable,
    sessionTable,
    aiProviderTable,
  ])
  const sessionId = `${runId}-session`
  const sessionManager = createSessionManager(sessionId)
  const createdAt = new Date('2026-04-02T03:04:05.000Z')
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

  const mirror = new LinxPiPodMirror({
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
  })
  await mirror.flush()
  await mirror.close()

  logStep('checking Pod ORM resources')
  const chatUri = context.db.resolveLocatorIri(chatTable, { id: DEFAULT_SECRETARY_CHAT_ID })
  const sessionUri = context.db.resolveLocatorIri(sessionTable, { id: sessionId, createdAt })
  const messageUri = context.db.resolveLocatorIri(messageTable, {
    id: `${sessionId}-u1`,
    chat: chatUri,
    createdAt,
  })
  const auditId = buildToolAuditId(sessionId, `${runId}-tool`, 'tool_execution_started')

  const [sessionRow, chatRow, messageRow, auditRows] = await Promise.all([
    context.db.findByLocator(sessionTable, { id: sessionId, createdAt }),
    context.db.findByLocator(chatTable, { id: DEFAULT_SECRETARY_CHAT_ID }),
    context.db.findByLocator(messageTable, { id: `${sessionId}-u1`, chat: chatUri, createdAt }),
    context.db.select().from(auditResource).execute(),
  ])
  const auditRow = auditRows.find((row) => row.id === auditId)
  if (!sessionRow || sessionRow.id !== sessionId || sessionRow.tool !== 'linx') {
    throw new Error(`session was not read back from Pod ORM: ${sessionId}`)
  }
  if (!chatRow || chatRow.id !== DEFAULT_SECRETARY_CHAT_ID || chatRow.title !== 'AI Secretary') {
    throw new Error(`chat was not read back from Pod ORM: ${DEFAULT_SECRETARY_CHAT_ID}`)
  }
  if (!messageRow?.content?.includes(`verify pod durable ${runId}`)) {
    throw new Error(`message was not read back from Pod ORM: ${sessionId}-u1`)
  }
  if (!auditRow || auditRow.action !== 'tool_execution_started' || auditRow.toolName !== 'verify-tool') {
    throw new Error(`audit was not read back from Pod ORM: ${auditId}`)
  }

  logStep('reading session/message directly from Pod source')
  const source = createNativeLinxPiPodSessionSource({
    webId: context.webId,
    db: context.db,
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
  const recoveredList = await listLinxPiSessions(cwd, recoveryAgentDir, {
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
  const recovered = await createLinxPiSessionManager({
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
  const credentialUri = context.db.resolveLocatorIri(credentialTable, { id: credentialId })
  const providerUri = context.db.resolveLocatorIri(aiProviderTable, { id: providerId })
  cleanupPodCredential = async () => {
    await Promise.allSettled([
      deleteByLocatorIfExists(context.db, credentialTable, { id: credentialId }),
      deleteByLocatorIfExists(context.db, aiProviderTable, { id: providerId }),
    ])
  }
  await upsertByLocator(context.db, aiProviderTable, { id: providerId }, {
    id: providerId,
    baseUrl: 'https://api.example.invalid/v1',
  }, {
    baseUrl: 'https://api.example.invalid/v1',
  })
  await upsertByLocator(context.db, credentialTable, { id: credentialId }, {
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
  const credentialRow = await context.db.findByLocator(credentialTable, { id: credentialId })
  if (credentialRow?.apiKey !== `linx-verify-not-a-secret-${runId}`) {
    throw new Error('inactive auth/credential config was not read back from Pod ORM')
  }

  logStep('writing approval/grant/audit resources')
  const store = __podApprovalInternal.createNativeRemoteApprovalStore(context.webId, context.db)
  const approvalId = `${runId}-approval`
  const grantId = `${runId}-grant`
  const approvalCreatedAt = new Date('2026-04-02T03:04:06.000Z')
  const grantCreatedAt = new Date('2026-04-02T03:04:07.000Z')
  const approvalAuditCreatedAt = new Date('2026-04-02T03:04:08.000Z')
  const approvalRef = store.resolveApprovalReference({
    id: approvalId,
    createdAt: approvalCreatedAt,
  })
  const approvalSessionUri = `${podBaseUrl(context.webId)}/.data/chat/linx-watch/index.ttl#${runId}`
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
    policyVersion: 'linx-watch-remote-approval/v1',
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
    approval: approvalRef.iri,
    context: JSON.stringify({ runId }),
    policyVersion: 'linx-watch-remote-approval/v1',
    createdAt: approvalAuditCreatedAt,
  })

  const [approvals, grants, audits] = await Promise.all([
    store.listApprovals(),
    store.listGrants(),
    store.listAudits(),
  ])
  if (!approvals.some((row) => row.id === approvalId && row.status === 'pending')) {
    throw new Error('approval was not read back from Pod')
  }
  if (!grants.some((row) => row.id === grantId && row.effect === 'allow')) {
    throw new Error('grant was not read back from Pod')
  }
  if (!audits.some((row) => row.id === `${runId}-approval-audit` && row.action === 'approval_requested')) {
    throw new Error('approval audit was not read back from Pod')
  }
  const grantRef = store.resolveGrantReference({ id: grantId })

  console.log(JSON.stringify({
    ok: true,
    runId,
    webId: context.webId,
    resources: {
      sessionUrl: sessionUri,
      chatUrl: chatUri,
      messageUrl: messageUri,
      auditUrl: rowIri(auditRow) ?? auditId,
      approvalUrl: approvalRef.iri,
      grantUrl: grantRef.iri,
      credentialUrl: credentialUri,
      providerUrl: providerUri,
    },
    podReadback: {
      sessionMessages: found.messages.length,
      approvals: approvals.filter((row) => row.id === approvalId).length,
      grants: grants.filter((row) => row.id === grantId).length,
      audits: audits.filter((row) => row.id === `${runId}-approval-audit`).length,
      credentials: credentialRow?.id === credentialId ? 1 : 0,
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
