import 'dotenv/config'
import { afterAll, describe, expect, it } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import { approvalResource } from '../src/approval.schema'
import { auditResource } from '../src/audit.schema'
import { chatTable } from '../src/chat.schema'
import { grantResource } from '../src/grant.schema'
import { messageTable } from '../src/message.schema'
import { solidSchema } from '../src/schema'
import { sessionTable } from '../src/session/session.schema'
import { threadTable } from '../src/thread.schema'
import { startLocalXpod, type LocalXpodTestPod } from './utils/local-xpod'

let localXpod: LocalXpodTestPod | null = null
let session: Session | null = null
let db: SolidDatabase | null = null

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

async function ensureEnv(): Promise<typeof env> {
  if (env.webId && env.clientId && env.clientSecret && env.oidcIssuer) return env
  if (!localXpod) {
    localXpod = await startLocalXpod()
  }
  env.webId = localXpod.webId
  env.clientId = localXpod.clientId
  env.clientSecret = localXpod.clientSecret
  env.oidcIssuer = localXpod.oidcIssuer
  return env
}

async function getDb(): Promise<SolidDatabase> {
  if (db) return db

  const activeEnv = await ensureEnv()
  session = new Session()
  await session.login({
    clientId: activeEnv.clientId!,
    clientSecret: activeEnv.clientSecret!,
    oidcIssuer: activeEnv.oidcIssuer!,
    tokenType: 'DPoP',
  })

  db = drizzle(session, {
    logger: false,
    disableInteropDiscovery: true,
    schema: solidSchema,
  })

  await db.init([
    chatTable,
    threadTable,
    messageTable,
    sessionTable,
    approvalResource,
    grantResource,
    auditResource,
  ])

  return db
}

afterAll(async () => {
  await session?.logout?.().catch(() => undefined)
  await localXpod?.stop()
})

function testId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function podBaseUrl(webId: string): string {
  return webId.replace('/profile/card#me', '').replace(/\/$/, '')
}

function subjectIri(row: Record<string, unknown>): string {
  const value = row['@id'] ?? row.subject ?? row.uri ?? row.source
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected persisted row to expose an IRI: ${JSON.stringify(row)}`)
  }
  return value
}

async function expectDeleted(
  database: SolidDatabase,
  table: Parameters<SolidDatabase['findByIri']>[0],
  iri: string,
): Promise<void> {
  const deleted = await database.deleteByIri(table, iri)
  expect(deleted).toBe(true)
  await expect(database.findByIri(table, iri)).resolves.toBeNull()
}

async function expectResourceContains(session: Session, url: string, text: string): Promise<void> {
  const response = await session.fetch(url, { headers: { accept: 'text/turtle' } })
  expect(response.ok).toBe(true)
  const body = await response.text()
  expect(body).toContain(text)
}

async function expectResourceNotContains(session: Session, url: string, text: string): Promise<void> {
  const response = await session.fetch(url, { headers: { accept: 'text/turtle' } })
  expect(response.ok).toBe(true)
  const body = await response.text()
  expect(body).not.toContain(text)
}

async function step<T>(name: string, action: () => Promise<T>): Promise<T> {
  console.log(`POD_CRUD_STEP start ${name}`)
  const result = await action()
  console.log(`POD_CRUD_STEP done ${name}`)
  return result
}

describe('Solid Pod live CRUD core surfaces', () => {
  it('creates, reads, updates, and deletes chat/thread/message/session/approval/grant/audit on local xpod', { timeout: 90_000 }, async () => {
    const database = await getDb()
    const activeEnv = await ensureEnv()
    const webId = activeEnv.webId!
    const baseUrl = podBaseUrl(webId)
    const now = new Date('2026-01-02T03:04:05.000Z')

    const chatId = testId('chat')
    const threadId = testId('thread')
    const messageId = testId('message')
    const runtimeSessionId = testId('session')
    const approvalId = testId('approval')
    const grantId = testId('grant')
    const auditId = testId('audit')

    const chatIri = database.resolveLocatorIri(chatTable, { id: chatId })
    const threadIri = database.resolveLocatorIri(threadTable, { id: threadId, chat: chatIri })

    await step('chat.create', () => database.insert(chatTable).values({
      id: chatId,
      title: 'Pod CRUD chat',
      description: `created-${chatId}`,
      participants: [webId],
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }).execute())
    await step('chat.read', async () => expect(database.findByIri(chatTable, chatIri)).resolves.toMatchObject({
      id: chatId,
      title: 'Pod CRUD chat',
    }))
    await step('chat.update', async () => expect(database.updateByIri(chatTable, chatIri, {
      title: 'Pod CRUD chat updated',
      updatedAt: new Date('2026-01-02T04:04:05.000Z'),
    })).resolves.toMatchObject({ title: 'Pod CRUD chat updated' }))

    await step('thread.create', () => database.insert(threadTable).values({
      id: threadId,
      chat: chatIri,
      title: 'Pod CRUD thread',
      workspace: `${baseUrl}/workspace/${threadId}/`,
      metadata: { source: 'pod.integration.test' },
      createdAt: now,
      updatedAt: now,
    }).execute())
    await step('thread.read', async () => expect(database.findByIri(threadTable, threadIri)).resolves.toMatchObject({
      id: threadId,
      title: 'Pod CRUD thread',
    }))
    await step('thread.update', async () => expect(database.updateByIri(threadTable, threadIri, {
      title: 'Pod CRUD thread updated',
      updatedAt: new Date('2026-01-02T04:05:05.000Z'),
    })).resolves.toMatchObject({ title: 'Pod CRUD thread updated' }))

    await step('message.create', () => database.insert(messageTable).values({
      id: messageId,
      chat: chatIri,
      thread: threadIri,
      maker: webId,
      role: 'user',
      content: 'Pod CRUD message',
      status: 'sent',
      createdAt: now,
      updatedAt: now,
    }).execute())
    const messageIri = database.resolveLocatorIri(messageTable, { id: messageId, chat: chatIri, createdAt: now })
    const messageDocUrl = messageIri.split('#')[0]
    await step('message.read', async () => expectResourceContains(session!, messageDocUrl, 'Pod CRUD message'))
    await step('message.update', async () => {
      const result = await database.update(messageTable).set({
        content: 'Pod CRUD message updated',
        status: 'sent',
        updatedAt: new Date('2026-01-02T04:06:05.000Z'),
      }).whereByIri(messageIri).execute()
      expect(result.length).toBeGreaterThan(0)
      await expectResourceContains(session!, messageDocUrl, 'Pod CRUD message updated')
    })
    await step('message.verify-update', async () => expectResourceContains(session!, messageDocUrl, 'Pod CRUD message updated'))

    const runtimeSessionIri = database.resolveLocatorIri(sessionTable, { id: runtimeSessionId, createdAt: now })
    const [createdSession] = await step('session.create', () => database.insert(sessionTable).values({
      id: runtimeSessionId,
      ownerWebId: webId,
      chat: chatIri,
      thread: threadIri,
      sessionType: 'direct',
      status: 'active',
      tool: 'linx',
      tokenUsage: 12,
      policyVersion: 'pod-crud-test/v1',
      metadata: { source: 'pod.integration.test' },
      createdAt: now,
      updatedAt: now,
    }).execute())
    expect(subjectIri(createdSession as Record<string, unknown>)).toBe(runtimeSessionIri.split('#')[0])
    await step('session.read', async () => expect(database.findByIri(sessionTable, runtimeSessionIri)).resolves.toMatchObject({
      id: runtimeSessionId,
      chat: chatIri,
      thread: threadIri,
      status: 'active',
      tokenUsage: 12,
    }))
    await step('session.update', async () => expect(database.updateByIri(sessionTable, runtimeSessionIri, {
      status: 'completed',
      tokenUsage: 34,
      updatedAt: new Date('2026-01-02T04:07:05.000Z'),
    })).resolves.toMatchObject({ status: 'completed', tokenUsage: 34 }))

    const approvalIri = database.resolveLocatorIri(approvalResource, { id: approvalId, createdAt: now })
    await step('approval.create', () => database.insert(approvalResource).values({
      id: approvalId,
      session: runtimeSessionIri,
      toolCallId: `tool-${approvalId}`,
      toolName: 'shell',
      target: `${baseUrl}/workspace/${threadId}/`,
      action: 'https://undefineds.co/ns#executeCommand',
      risk: 'medium',
      status: 'pending',
      assignedTo: webId,
      approvalOptions: JSON.stringify([
        { optionId: 'allow_once', label: 'Allow once', kind: 'allow_once' },
        { optionId: 'allow_always', label: 'Always allow', kind: 'allow_always' },
      ]),
      policyVersion: 'pod-crud-test/v1',
      createdAt: now,
      expiresAt: new Date('2026-01-02T03:05:05.000Z'),
    }).execute())
    await step('approval.read', async () => expect(database.findByIri(approvalResource, approvalIri)).resolves.toMatchObject({
      id: approvalId,
      status: 'pending',
      toolName: 'shell',
      approvalOptions: JSON.stringify([
        { optionId: 'allow_once', label: 'Allow once', kind: 'allow_once' },
        { optionId: 'allow_always', label: 'Always allow', kind: 'allow_always' },
      ]),
    }))
    await step('approval.update', async () => expect(database.updateByIri(approvalResource, approvalIri, {
      status: 'approved',
      decisionBy: webId,
      decisionRole: 'owner',
      reason: 'integration test approval',
      resolvedAt: new Date('2026-01-02T04:08:05.000Z'),
    })).resolves.toMatchObject({ status: 'approved', decisionBy: webId }))

    const grantIri = database.resolveLocatorIri(grantResource, { id: grantId })
    await step('grant.create', () => database.insert(grantResource).values({
      id: grantId,
      target: `${baseUrl}/workspace/${threadId}/`,
      action: 'https://undefineds.co/ns#executeCommand',
      title: 'Integration grant',
      summary: 'Integration test semantic grant wiki page.',
      body: 'Allow semantically equivalent command approvals in this integration session.',
      schema: `${baseUrl}/settings/autonomy/schema/grant.ttl#GrantWikiPage`,
      pageKind: 'autonomy-grant',
      wikiStatus: 'active',
      tags: JSON.stringify(['autonomy', 'grant', 'commandExecution']),
      source: 'approval',
      sourceHash: 'approval:integration',
      compiledAt: now,
      compiledFrom: [approvalIri],
      related: [runtimeSessionIri],
      effect: 'allow',
      riskCeiling: 'medium',
      policy: 'Allow semantically equivalent command approvals in this integration session.',
      context: JSON.stringify({ toolName: 'shell', cwd: '/tmp/demo' }),
      decisionBy: webId,
      decisionRole: 'owner',
      onBehalfOf: webId,
      createdAt: now,
    }).execute())
    await step('grant.read', async () => expect(database.findByIri(grantResource, grantIri)).resolves.toMatchObject({
      id: grantId,
      title: 'Integration grant',
      summary: 'Integration test semantic grant wiki page.',
      body: 'Allow semantically equivalent command approvals in this integration session.',
      schema: `${baseUrl}/settings/autonomy/schema/grant.ttl#GrantWikiPage`,
      pageKind: 'autonomy-grant',
      wikiStatus: 'active',
      tags: JSON.stringify(['autonomy', 'grant', 'commandExecution']),
      source: 'approval',
      sourceHash: 'approval:integration',
      compiledFrom: [approvalIri],
      related: [runtimeSessionIri],
      effect: 'allow',
      riskCeiling: 'medium',
      policy: 'Allow semantically equivalent command approvals in this integration session.',
      context: JSON.stringify({ toolName: 'shell', cwd: '/tmp/demo' }),
    }))
    await step('grant.update', async () => expect(database.updateByIri(grantResource, grantIri, {
      riskCeiling: 'high',
      wikiStatus: 'reviewed',
    })).resolves.toMatchObject({ riskCeiling: 'high', wikiStatus: 'reviewed' }))

    const auditIri = database.resolveLocatorIri(auditResource, { id: auditId, createdAt: now })
    await step('audit.create', () => database.insert(auditResource).values({
      id: auditId,
      action: 'approval_requested',
      actor: webId,
      actorRole: 'owner',
      onBehalfOf: webId,
      session: runtimeSessionIri,
      toolCallId: `tool-${approvalId}`,
      approval: approvalIri,
      policyVersion: 'pod-crud-test/v1',
      createdAt: now,
    }).execute())
    await step('audit.read', async () => expect(database.findByIri(auditResource, auditIri)).resolves.toMatchObject({
      id: auditId,
      action: 'approval_requested',
      actor: webId,
    }))
    await step('audit.update', async () => expect(database.updateByIri(auditResource, auditIri, {
      policyVersion: 'pod-crud-test/v2',
    })).resolves.toMatchObject({
      policyVersion: 'pod-crud-test/v2',
    }))

    await step('audit.delete', () => expectDeleted(database, auditResource, auditIri))
    await step('grant.delete', () => expectDeleted(database, grantResource, grantIri))
    await step('approval.delete', () => expectDeleted(database, approvalResource, approvalIri))
    await step('message.delete', async () => {
      const result = await database.delete(messageTable).whereByIri(messageIri).execute()
      expect(result.length).toBeGreaterThan(0)
      await expectResourceNotContains(session!, messageDocUrl, messageIri)
      await expectResourceNotContains(session!, messageDocUrl, 'Pod CRUD message updated')
    })
    await step('session.delete', () => expectDeleted(database, sessionTable, runtimeSessionIri))
    await step('thread.delete', () => expectDeleted(database, threadTable, threadIri))
    await step('chat.delete', () => expectDeleted(database, chatTable, chatIri))
  })
})
