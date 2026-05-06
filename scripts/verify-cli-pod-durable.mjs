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
  RDF_TYPE,
  buildAuditResourceUrl,
  buildMessageResourceUrl,
  buildSessionResourceUrl,
  deleteManagedTurtleSubject,
  iri,
  literal,
  readTurtleResource,
  upsertManagedTurtleBlock,
} from '../apps/cli/dist/lib/pi-adapter/pod-native.js'
import { __podApprovalInternal } from '../apps/cli/dist/lib/watch/pod-approval.js'
import { loadCredentials, getClientCredentials } from '../apps/cli/dist/lib/credentials-store.js'
import { getOidcAccessToken } from '../apps/cli/dist/lib/oidc-auth.js'
import { authenticate, authenticatedFetch } from '../apps/cli/dist/lib/solid-auth.js'

const runId = `linx-verify-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
const cwd = mkdtempSync(join(tmpdir(), 'linx-verify-cwd-'))
const agentDir = mkdtempSync(join(tmpdir(), 'linx-verify-agent-'))
const recoveryAgentDir = mkdtempSync(join(tmpdir(), 'linx-verify-recovery-agent-'))
let cleanupPodCredential = null
const XPOD_AI_PROVIDER = 'https://vocab.xpod.dev/ai#Provider'
const XPOD_CREDENTIAL = {
  Credential: 'https://vocab.xpod.dev/credential#Credential',
  provider: 'https://vocab.xpod.dev/credential#provider',
  service: 'https://vocab.xpod.dev/credential#service',
  status: 'https://vocab.xpod.dev/credential#status',
  apiKey: 'https://vocab.xpod.dev/credential#apiKey',
  baseUrl: 'https://vocab.xpod.dev/credential#baseUrl',
  label: 'https://vocab.xpod.dev/credential#label',
}

function podBaseUrl(webId) {
  return webId.replace('/profile/card#me', '').replace(/\/$/, '')
}

async function createFetchContext() {
  const credentials = loadCredentials()
  if (!credentials) {
    throw new Error('No ~/.linx credentials found. Run `linx login` first.')
  }
  const clientCredentials = getClientCredentials(credentials)
  if (clientCredentials) {
    const { session } = await authenticate(clientCredentials.clientId, clientCredentials.clientSecret, credentials.url)
    const webId = session.info.webId || credentials.webId
    return {
      credentials,
      webId,
      fetch: (url, init) => session.fetch(url, init),
      logout: () => session.logout().catch(() => undefined),
    }
  }
  if (credentials.authType === 'oidc_oauth') {
    const accessToken = await getOidcAccessToken(credentials)
    if (!accessToken) {
      throw new Error('OIDC credentials did not produce an access token. Run `linx login` again.')
    }
    return {
      credentials,
      webId: credentials.webId,
      fetch: (url, init) => authenticatedFetch(url, accessToken, init),
      logout: async () => {},
    }
  }
  throw new Error(`Unsupported LinX auth type: ${credentials.authType}`)
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

async function fetchText(fetcher, url) {
  const response = await fetcher(url, { method: 'GET', headers: { Accept: 'text/turtle' } })
  const text = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}\n${text}`)
  }
  return text
}

function assertIncludes(label, text, expected) {
  if (!text.includes(expected)) {
    throw new Error(`${label} missing ${expected}\n${text}`)
  }
}

function logStep(message) {
  console.error(`[verify-cli-pod-durable] ${message}`)
}

async function main() {
  logStep('authenticating')
  const context = await createFetchContext()
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

  logStep('checking raw Pod TTL resources')
  const sessionUrl = buildSessionResourceUrl(context.webId, sessionId)
  const chatUrl = `${podBaseUrl(context.webId)}/.data/chat/${DEFAULT_SECRETARY_CHAT_ID}/index.ttl`
  const messageUrl = buildMessageResourceUrl(context.webId, DEFAULT_SECRETARY_CHAT_ID, createdAt)
  const auditUrl = buildAuditResourceUrl(
    context.webId,
    buildToolAuditId(sessionId, `${runId}-tool`, 'tool_execution_started'),
  )

  const [sessionTtl, chatTtl, messageTtl, auditTtl] = await Promise.all([
    fetchText(context.fetch, sessionUrl),
    fetchText(context.fetch, chatUrl),
    fetchText(context.fetch, messageUrl),
    fetchText(context.fetch, auditUrl),
  ])
  assertIncludes('session ttl', sessionTtl, sessionId)
  assertIncludes('session ttl', sessionTtl, 'linx')
  assertIncludes('chat ttl', chatTtl, '#this')
  assertIncludes('chat ttl', chatTtl, sessionId)
  assertIncludes('chat ttl', chatTtl, 'AI Secretary')
  assertIncludes('message ttl', messageTtl, `verify pod durable ${runId}`)
  assertIncludes('message ttl', messageTtl, `${sessionId}-u1`)
  assertIncludes('audit ttl', auditTtl, 'tool_execution_started')
  assertIncludes('audit ttl', auditTtl, 'verify-tool')

  logStep('reading session/message directly from Pod source')
  const source = createNativeLinxPiPodSessionSource({
    webId: context.webId,
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
  const credentialResourceUrl = `${podBaseUrl(context.webId)}/settings/credentials.ttl`
  const credentialSubjectUrl = `${credentialResourceUrl}#${credentialId}`
  const providerResourceUrl = `${podBaseUrl(context.webId)}/settings/ai/providers.ttl`
  const providerSubjectUrl = `${providerResourceUrl}#linx-verify`
  cleanupPodCredential = async () => {
    await Promise.allSettled([
      deleteManagedTurtleSubject(context.fetch, credentialResourceUrl, credentialSubjectUrl),
      deleteManagedTurtleSubject(context.fetch, providerResourceUrl, providerSubjectUrl),
    ])
  }
  await upsertManagedTurtleBlock(context.fetch, credentialResourceUrl, {
    subject: credentialSubjectUrl,
    triples: [
      { predicate: RDF_TYPE, object: iri(XPOD_CREDENTIAL.Credential) },
      { predicate: XPOD_CREDENTIAL.provider, object: iri(providerSubjectUrl) },
      { predicate: XPOD_CREDENTIAL.service, object: literal('ai') },
      { predicate: XPOD_CREDENTIAL.status, object: literal('inactive') },
      { predicate: XPOD_CREDENTIAL.apiKey, object: literal(`linx-verify-not-a-secret-${runId}`) },
      { predicate: XPOD_CREDENTIAL.baseUrl, object: literal('https://api.example.invalid/v1') },
      { predicate: XPOD_CREDENTIAL.label, object: literal('LinX verifier inactive credential') },
    ],
  })
  await upsertManagedTurtleBlock(context.fetch, providerResourceUrl, {
    subject: providerSubjectUrl,
    triples: [
      { predicate: RDF_TYPE, object: iri(XPOD_AI_PROVIDER) },
    ],
  })
  const credentialTtl = await readTurtleResource(context.fetch, credentialResourceUrl)
  if (!credentialTtl?.includes(credentialId) || !credentialTtl.includes('linx-verify-not-a-secret')) {
    throw new Error('inactive auth/credential config was not read back from Pod')
  }

  logStep('writing approval/grant/audit resources')
  const store = __podApprovalInternal.createNativeRemoteApprovalStore(context.webId, context.fetch)
  const approvalId = `${runId}-approval`
  const grantId = `${runId}-grant`
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
    createdAt: new Date('2026-04-02T03:04:06.000Z'),
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
    createdAt: new Date('2026-04-02T03:04:07.000Z'),
  })
  await store.insertAudit({
    id: `${runId}-approval-audit`,
    action: 'approval_requested',
    actor: context.webId,
    actorRole: 'human',
    onBehalfOf: context.webId,
    session: approvalSessionUri,
    toolCallId: `${runId}-approval-tool`,
    approval: `${podBaseUrl(context.webId)}/.data/approvals/${approvalId}.ttl`,
    context: JSON.stringify({ runId }),
    policyVersion: 'linx-watch-remote-approval/v1',
    createdAt: new Date('2026-04-02T03:04:08.000Z'),
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

  console.log(JSON.stringify({
    ok: true,
    runId,
    webId: context.webId,
    resources: {
      sessionUrl,
      chatUrl,
      messageUrl,
      auditUrl,
      approvalUrl: `${podBaseUrl(context.webId)}/.data/approvals/${approvalId}.ttl`,
      grantUrl: `${podBaseUrl(context.webId)}/settings/autonomy/grants/${grantId}.ttl`,
      credentialUrl: `${credentialResourceUrl}#${credentialId}`,
    },
    podReadback: {
      sessionMessages: found.messages.length,
      approvals: approvals.filter((row) => row.id === approvalId).length,
      grants: grants.filter((row) => row.id === grantId).length,
      audits: audits.filter((row) => row.id === `${runId}-approval-audit`).length,
      credentials: credentialTtl.includes(credentialId) ? 1 : 0,
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
