import { afterAll, describe, expect, it } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import { aiModelTable } from '../src/ai-model.schema'
import { aiProviderTable } from '../src/ai-provider.schema'
import { approvalResource } from '../src/approval.schema'
import { credentialTable } from '../src/credential.schema'
import { favoriteTable } from '../src/favorite/favorite.schema'
import { fileTable } from '../src/file/file.schema'
import { inboxNotificationTable } from '../src/inbox-notification.schema'
import { SCHEMA } from '../src/namespaces'
import { solidProfileTable } from '../src/profile.schema'
import { solidSchema } from '../src/schema'
import { settingsTable } from '../src/settings/settings.schema'
import { startLocalXpod, type LocalXpodTestPod } from './utils/local-xpod'

let localXpod: LocalXpodTestPod | null = null
let session: Session | null = null
let db: SolidDatabase | null = null

function podBaseUrl(webId: string): string {
  return webId.replace('/profile/card#me', '').replace(/\/$/, '')
}

function subjectOf(row: unknown): string {
  const record = row as Record<string, unknown>
  const value = record?.['@id'] ?? record?.subject ?? record?.source ?? record?.uri
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected row subject, got ${JSON.stringify(row)}`)
  }
  return value
}

async function getDb(): Promise<SolidDatabase> {
  if (db) return db

  localXpod = await startLocalXpod()
  session = new Session()
  await session.login({
    clientId: localXpod.clientId,
    clientSecret: localXpod.clientSecret,
    oidcIssuer: localXpod.oidcIssuer,
    tokenType: 'DPoP',
  })
  db = drizzle(session, {
    logger: false,
    disableInteropDiscovery: true,
    schema: solidSchema,
  })
  await db.init([
    credentialTable,
    aiProviderTable,
    aiModelTable,
    settingsTable,
    fileTable,
    favoriteTable,
    inboxNotificationTable,
    solidProfileTable,
  ])
  return db
}

async function expectDeleted(
  database: SolidDatabase,
  table: Parameters<SolidDatabase['findByIri']>[0],
  iri: string,
): Promise<void> {
  await expect(database.deleteByIri(table, iri)).resolves.toBe(true)
  await expect(database.findByIri(table, iri)).resolves.toBeNull()
}

afterAll(async () => {
  await session?.logout?.().catch(() => undefined)
  await localXpod?.stop()
})

describe('Solid Pod secondary resource CRUD surfaces', () => {
  it('reads profile and CRUDs settings/credential/model/file/favorite/inbox resources', { timeout: 120_000 }, async () => {
    const database = await getDb()
    const webId = localXpod!.webId
    const podBase = podBaseUrl(webId)
    const now = new Date('2026-05-07T06:30:00.000Z')

    const profile = await database.findByIri(solidProfileTable, webId)
    expect(profile).toBeTruthy()
    expect(profile?.id).toBeTruthy()

    const providerId = `provider-${crypto.randomUUID()}`
    const providerIri = database.resolveLocatorIri(aiProviderTable, { id: providerId })
    await database.insert(aiProviderTable).values({
      id: providerId,
      baseUrl: 'https://api.provider.example/v1',
      proxyUrl: 'https://proxy.provider.example/v1',
    }).execute()

    const credentialId = `credential-${crypto.randomUUID()}`
    const credentialIri = database.resolveLocatorIri(credentialTable, { id: credentialId })
    await database.insert(credentialTable).values({
      id: credentialId,
      provider: providerIri,
      service: 'ai',
      status: 'active',
      apiKey: 'secret-smoke',
      baseUrl: 'https://api.example.test/v1',
      label: 'Smoke credential',
      lastUsedAt: now,
      failCount: 0,
    }).execute()
    await expect(database.findByIri(credentialTable, credentialIri)).resolves.toMatchObject({
      id: credentialId,
      label: 'Smoke credential',
    })
    await expect(database.updateByIri(credentialTable, credentialIri, {
      label: 'Smoke credential updated',
      failCount: 1,
    })).resolves.toMatchObject({ label: 'Smoke credential updated', failCount: 1 })
    await expectDeleted(database, credentialTable, credentialIri)

    const modelId = `model-${crypto.randomUUID()}`
    const modelLocator = { id: modelId, isProvidedBy: providerIri }
    const modelIri = database.resolveLocatorIri(aiModelTable, modelLocator)
    await database.insert(aiModelTable).values({
      id: modelId,
      displayName: 'Smoke Model',
      modelType: 'chat',
      isProvidedBy: providerIri,
      dimension: 1024,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).execute()
    await expect(database.findByIri(aiModelTable, modelIri)).resolves.toMatchObject({
      id: modelId,
      displayName: 'Smoke Model',
    })
    await expect(database.updateByIri(aiModelTable, modelIri, {
      displayName: 'Smoke Model updated',
      status: 'inactive',
      updatedAt: now,
    })).resolves.toMatchObject({ displayName: 'Smoke Model updated', status: 'inactive' })
    await expectDeleted(database, aiModelTable, modelIri)
    await expectDeleted(database, aiProviderTable, providerIri)

    const settingKey = `smoke.setting.${crypto.randomUUID()}`
    const settingIri = `${podBase}/settings/${settingKey}.ttl`
    await database.insert(settingsTable).values({
      key: settingKey,
      value: JSON.stringify({ enabled: true }),
      valueType: 'json',
      category: 'sync',
      label: 'Smoke Setting',
      description: 'Smoke test setting',
      owner: webId,
      isSensitive: false,
      createdAt: now,
      modifiedAt: now,
    }).execute()
    const settingRows = await database
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, settingKey))
      .execute()
    expect(settingRows).toHaveLength(1)
    expect(subjectOf(settingRows[0])).toBe(settingIri)
    await expect(database.updateByIri(settingsTable, settingIri, {
      label: 'Smoke Setting updated',
      modifiedAt: now,
    })).resolves.toMatchObject({ label: 'Smoke Setting updated' })
    await expectDeleted(database, settingsTable, settingIri)

    const fileId = `file-${crypto.randomUUID()}`
    const fileIri = database.resolveLocatorIri(fileTable, { id: fileId })
    await database.insert(fileTable).values({
      id: fileId,
      name: 'smoke.txt',
      description: 'Smoke file metadata',
      mimeType: 'text/plain',
      size: 12,
      hash: 'sha256-smoke',
      podUri: `${podBase}/files/smoke.txt`,
      localPath: '/tmp/smoke.txt',
      syncStatus: 'synced',
      lastSyncedAt: now,
      owner: webId,
      sharedWith: JSON.stringify([]),
      folder: `${podBase}/files/`,
      tags: JSON.stringify(['smoke']),
      createdAt: now,
      modifiedAt: now,
      starred: false,
    }).execute()
    await expect(database.findByIri(fileTable, fileIri)).resolves.toMatchObject({
      id: fileId,
      name: 'smoke.txt',
    })
    await expect(database.updateByIri(fileTable, fileIri, {
      name: 'smoke-updated.txt',
      size: 13,
      modifiedAt: now,
    })).resolves.toMatchObject({ name: 'smoke-updated.txt', size: 13 })
    await expectDeleted(database, fileTable, fileIri)

    const favoriteId = `favorite-${crypto.randomUUID()}`
    const favoriteIri = database.resolveLocatorIri(favoriteTable, { id: favoriteId })
    await database.insert(favoriteTable).values({
      id: favoriteId,
      targetType: SCHEMA.CreativeWork,
      targetUri: `${podBase}/.data/chat/favorite-target/index.ttl#this`,
      title: 'Smoke Favorite',
      snapshotContent: 'favorite smoke content',
      snapshotAuthor: webId,
      sourceModule: 'chat',
      sourceId: 'favorite-target',
      searchText: 'smoke favorite',
      snapshotMeta: JSON.stringify({ smoke: true }),
      favoredAt: now,
      updatedAt: now,
    }).execute()
    await expect(database.findByIri(favoriteTable, favoriteIri)).resolves.toMatchObject({
      id: favoriteId,
      title: 'Smoke Favorite',
    })
    await expect(database.updateByIri(favoriteTable, favoriteIri, {
      title: 'Smoke Favorite updated',
      updatedAt: now,
    })).resolves.toMatchObject({ title: 'Smoke Favorite updated' })
    await expectDeleted(database, favoriteTable, favoriteIri)

    const inboxId = `inbox-${crypto.randomUUID()}`
    const inboxIri = database.resolveLocatorIri(inboxNotificationTable, { id: inboxId })
    const approvalObjectIri = database.resolveLocatorIri(approvalResource, { id: 'smoke', createdAt: now })
    await database.insert(inboxNotificationTable).values({
      id: inboxId,
      actor: webId,
      object: approvalObjectIri,
      createdAt: now,
    }).execute()
    await expect(database.findByIri(inboxNotificationTable, inboxIri)).resolves.toMatchObject({
      id: inboxId,
      object: approvalObjectIri,
    })
    await expect(database.updateByIri(inboxNotificationTable, inboxIri, {
      actor: `${podBase}/profile/card#updated`,
      createdAt: now,
    })).resolves.toMatchObject({ actor: `${podBase}/profile/card#updated` })
    await expectDeleted(database, inboxNotificationTable, inboxIri)
  })
})
