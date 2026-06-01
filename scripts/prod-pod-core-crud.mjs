#!/usr/bin/env node
import {
  getClientCredentialId,
  getClientCredentialKey,
  getClientCredentials,
  loadCredentials,
} from '../apps/cli/dist/lib/credentials-store.js'
import { getOidcAccessToken } from '../apps/cli/dist/lib/oidc-auth.js'
import { authenticate, authenticatedFetch } from '../apps/cli/dist/lib/solid-auth.js'
import { assertDedicatedProdSmokeAccount } from './prod-smoke-account-guard.mjs'

const runId = `linx-prod-crud-${crypto.randomUUID()}`
const created = []
let didCreateAnyResource = false

function podBaseUrl(webId) {
  const url = new URL(webId)
  const owner = url.pathname.split('/').filter(Boolean)[0]
  return `${url.origin}/${owner}`
}

function createOidcSessionLike(credentials, accessToken) {
  return {
    info: {
      isLoggedIn: true,
      webId: credentials.webId,
      podUrl: `${podBaseUrl(credentials.webId)}/`,
    },
    async logout() {},
    fetch(url, init) {
      return authenticatedFetch(url, accessToken, init)
    },
  }
}

async function createSession() {
  const credentials = loadCredentials()
  if (!credentials) {
    throw new Error('No ~/.linx credentials found. Run `linx login` first.')
  }
  assertDedicatedProdSmokeAccount(credentials.webId, { scriptName: 'scripts/prod-pod-core-crud.mjs' })

  const clientCredentials = getClientCredentials(credentials)
  if (clientCredentials) {
    const { session } = await authenticate(
      getClientCredentialId(clientCredentials),
      getClientCredentialKey(clientCredentials),
      credentials.url,
    )
    return { credentials, session }
  }

  if (credentials.authType === 'oidc_oauth') {
    const accessToken = await getOidcAccessToken(credentials)
    if (!accessToken) {
      throw new Error('OIDC credentials did not produce an access token. Run `linx login` again.')
    }
    return {
      credentials,
      session: createOidcSessionLike(credentials, accessToken),
    }
  }

  throw new Error(`Unsupported LinX auth type: ${credentials.authType}`)
}

async function readRaw(session, iri) {
  const resourceUrl = iri.split('#')[0]
  const response = await session.fetch(resourceUrl, { headers: { accept: 'text/turtle' } })
  const text = await response.text().catch(() => '')
  return {
    url: resourceUrl,
    status: response.status,
    ok: response.ok,
    text,
  }
}

async function dumpFailure(session, label, iri, row, error) {
  const raw = await readRaw(session, iri).catch((rawError) => ({
    url: iri.split('#')[0],
    status: 0,
    ok: false,
    text: `Failed to fetch raw resource: ${rawError instanceof Error ? rawError.stack : String(rawError)}`,
  }))
  console.error(`\nPROD_CRUD_FAILURE ${label}`)
  console.error(`IRI ${iri}`)
  console.error(`RAW ${raw.status} ${raw.url}`)
  console.error(raw.text)
  console.error('ROW')
  console.error(JSON.stringify(row, null, 2))
  console.error('ERROR')
  console.error(error instanceof Error ? error.stack : String(error))
}

function expectEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`)
  }
}

function expectMatch(label, row, expected) {
  if (!row || typeof row !== 'object') {
    throw new Error(`${label}: missing row`)
  }
  for (const [key, value] of Object.entries(expected)) {
    expectEqual(`${label}.${key}`, row[key], value)
  }
}

async function step(name, action) {
  console.log(`PROD_CRUD_STEP start ${name}`)
  const result = await action()
  console.log(`PROD_CRUD_STEP done ${name}`)
  return result
}

async function deleteIfExists(db, table, iri) {
  if (!didCreateAnyResource) {
    return
  }
  try {
    const deleted = await db.deleteByIri(table, iri)
    console.log(`PROD_CRUD_CLEANUP ${deleted ? 'deleted' : 'missing'} ${iri}`)
  } catch (error) {
    console.log(`PROD_CRUD_CLEANUP failed ${iri}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function main() {
  const { credentials, session } = await createSession()
  const webId = session.info.webId || credentials.webId
  assertDedicatedProdSmokeAccount(webId, { scriptName: 'scripts/prod-pod-core-crud.mjs' })
  const {
    approvalTable,
    auditTable,
    chatTable,
    applySolidComunicaPatches,
    drizzle,
    grantTable,
    messageTable,
    sessionTable,
    solidSchema,
    threadTable,
  } = await import('../packages/models/dist/index.js')
  applySolidComunicaPatches()
  const baseUrl = podBaseUrl(webId)
  const db = drizzle(session, {
    logger: false,
    disableInteropDiscovery: true,
    schema: solidSchema,
  })

  await db.init([
    chatTable,
    threadTable,
    messageTable,
    sessionTable,
    approvalTable,
    grantTable,
    auditTable,
  ])

  const now = new Date('2026-01-02T03:04:05.000Z')
  const chatId = `${runId}-chat`
  const threadId = `${runId}-thread`
  const messageId = `${runId}-message`
  const runtimeSessionId = `${runId}-session`
  const approvalId = `${runId}-approval`
  const grantId = `${runId}-grant`
  const auditId = `${runId}-audit`

  const chatIri = db.resolveLocatorIri(chatTable, { id: chatId })
  const chatResourceId = db.resolveResourceId(chatTable, chatIri)
  const threadIri = db.resolveLocatorIri(threadTable, { id: threadId, chat: chatIri })
  const threadResourceId = db.resolveResourceId(threadTable, threadIri)
  const messageIri = db.resolveLocatorIri(messageTable, { id: messageId, chat: chatIri, createdAt: now })
  const runtimeSessionIri = db.resolveLocatorIri(sessionTable, { id: runtimeSessionId, createdAt: now })
  const runtimeSessionResourceId = db.resolveResourceId(sessionTable, runtimeSessionIri)
  const approvalIri = db.resolveLocatorIri(approvalTable, { id: approvalId, createdAt: now })
  const approvalResourceId = db.resolveResourceId(approvalTable, approvalIri)
  const grantIri = db.resolveLocatorIri(grantTable, { id: grantId })
  const grantResourceId = db.resolveResourceId(grantTable, grantIri)
  const auditIri = db.resolveLocatorIri(auditTable, { id: auditId, createdAt: now })
  const auditResourceId = db.resolveResourceId(auditTable, auditIri)

  created.push([auditTable, auditIri], [grantTable, grantIri], [approvalTable, approvalIri], [messageTable, messageIri], [sessionTable, runtimeSessionIri], [threadTable, threadIri], [chatTable, chatIri])

  try {
    await step('chat.create', () => db.insert(chatTable).values({
      id: chatId,
      title: 'Prod CRUD chat',
      description: `created-${chatId}`,
      participants: [webId],
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }).execute())
    didCreateAnyResource = true
    expectMatch('chat.read', await step('chat.read', () => db.findByIri(chatTable, chatIri)), {
      id: chatResourceId,
      title: 'Prod CRUD chat',
    })
    expectMatch('chat.update', await step('chat.update', () => db.updateByIri(chatTable, chatIri, {
      title: 'Prod CRUD chat updated',
      updatedAt: new Date('2026-01-02T04:04:05.000Z'),
    })), { title: 'Prod CRUD chat updated' })

    await step('thread.create', () => db.insert(threadTable).values({
      id: threadId,
      chat: chatIri,
      title: 'Prod CRUD thread',
      workspace: `${baseUrl}/workspace/${threadId}/`,
      metadata: { source: 'prod-pod-core-crud' },
      createdAt: now,
      updatedAt: now,
    }).execute())
    expectMatch('thread.read', await step('thread.read', () => db.findByIri(threadTable, threadIri)), {
      id: threadResourceId,
      title: 'Prod CRUD thread',
    })
    expectMatch('thread.update', await step('thread.update', () => db.updateByIri(threadTable, threadIri, {
      title: 'Prod CRUD thread updated',
      updatedAt: new Date('2026-01-02T04:05:05.000Z'),
    })), { title: 'Prod CRUD thread updated' })

    await step('message.create', () => db.insert(messageTable).values({
      id: messageId,
      chat: chatIri,
      thread: threadIri,
      maker: webId,
      role: 'user',
      content: 'Prod CRUD message',
      status: 'sent',
      createdAt: now,
      updatedAt: now,
    }).execute())
    let raw = await readRaw(session, messageIri)
    if (!raw.ok || !raw.text.includes('Prod CRUD message')) {
      throw new Error(`message.read raw missing content: ${raw.status}`)
    }
    await step('message.update', () => db.update(messageTable).set({
      content: 'Prod CRUD message updated',
      status: 'sent',
      updatedAt: new Date('2026-01-02T04:06:05.000Z'),
    }).whereByIri(messageIri).execute())
    raw = await readRaw(session, messageIri)
    if (!raw.ok || !raw.text.includes('Prod CRUD message updated')) {
      throw new Error(`message.update raw missing updated content: ${raw.status}`)
    }

    await step('session.create', () => db.insert(sessionTable).values({
      id: runtimeSessionId,
      owner: webId,
      chat: chatIri,
      thread: threadIri,
      sessionType: 'direct',
      status: 'active',
      tool: 'linx',
      tokenUsage: 12,
      policyVersion: 'prod-pod-core-crud/v1',
      metadata: { source: 'prod-pod-core-crud' },
      createdAt: now,
      updatedAt: now,
    }).execute())
    expectMatch('session.read', await step('session.read', () => db.findByIri(sessionTable, runtimeSessionIri)), {
      id: runtimeSessionResourceId,
      chat: chatIri,
      thread: threadIri,
      status: 'active',
      tokenUsage: 12,
    })
    expectMatch('session.update', await step('session.update', () => db.updateByIri(sessionTable, runtimeSessionIri, {
      status: 'completed',
      tokenUsage: 34,
      updatedAt: new Date('2026-01-02T04:07:05.000Z'),
    })), { status: 'completed', tokenUsage: 34 })

    await step('approval.create', () => db.insert(approvalTable).values({
      id: approvalId,
      session: runtimeSessionIri,
      toolCallId: `tool-${approvalId}`,
      toolName: 'shell',
      target: `${baseUrl}/workspace/${threadId}/`,
      action: 'https://undefineds.co/ns#executeCommand',
      risk: 'medium',
      status: 'pending',
      assignedTo: webId,
      policyVersion: 'prod-pod-core-crud/v1',
      createdAt: now,
    }).execute())
    const approvalRow = await step('approval.read', () => db.findByIri(approvalTable, approvalIri))
    try {
      expectMatch('approval.read', approvalRow, {
        id: approvalResourceId,
        status: 'pending',
        toolName: 'shell',
      })
    } catch (error) {
      await dumpFailure(session, 'approval.read', approvalIri, approvalRow, error)
      throw error
    }
    expectMatch('approval.update', await step('approval.update', () => db.updateByIri(approvalTable, approvalIri, {
      status: 'approved',
      decisionBy: webId,
      decisionRole: 'owner',
      reason: 'prod crud approval',
      resolvedAt: new Date('2026-01-02T04:08:05.000Z'),
    })), { status: 'approved', decisionBy: webId })

    await step('grant.create', () => db.insert(grantTable).values({
      id: grantId,
      target: `${baseUrl}/workspace/${threadId}/`,
      action: 'https://undefineds.co/ns#executeCommand',
      effect: 'allow',
      riskCeiling: 'medium',
      decisionBy: webId,
      decisionRole: 'owner',
      onBehalfOf: webId,
      createdAt: now,
    }).execute())
    expectMatch('grant.read', await step('grant.read', () => db.findByIri(grantTable, grantIri)), {
      id: grantResourceId,
      effect: 'allow',
      riskCeiling: 'medium',
    })
    expectMatch('grant.update', await step('grant.update', () => db.updateByIri(grantTable, grantIri, {
      riskCeiling: 'high',
    })), { riskCeiling: 'high' })

    await step('audit.create', () => db.insert(auditTable).values({
      id: auditId,
      action: 'approval_requested',
      actor: webId,
      actorRole: 'owner',
      onBehalfOf: webId,
      session: runtimeSessionIri,
      toolCallId: `tool-${approvalId}`,
      approval: approvalIri,
      policyVersion: 'prod-pod-core-crud/v1',
      createdAt: now,
    }).execute())
    expectMatch('audit.read', await step('audit.read', () => db.findByIri(auditTable, auditIri)), {
      id: auditResourceId,
      action: 'approval_requested',
      actor: webId,
    })
    expectMatch('audit.update', await step('audit.update', () => db.updateByIri(auditTable, auditIri, {
      policyVersion: 'prod-pod-core-crud/v2',
    })), {
      policyVersion: 'prod-pod-core-crud/v2',
    })

    console.log(`PROD_CRUD_PASS ${runId}`)
  } finally {
    for (const [table, iri] of created) {
      await deleteIfExists(db, table, iri)
    }
    await session.logout?.()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
