// @vitest-environment node
/**
 * Real-Pod regression for the Agent metadata write/read contract.
 *
 * An Agent is a directory resource whose RDF graph lives in
 * `/agents/{key}/.meta`, which xpod/CSS treats as *server-managed metadata*:
 * the server owns `dcterms:modified` and rejects client writes to it. The
 * app-owned part of the shared `agentResource` timestamp contract is
 * `dcterms:created`; this test writes it once at creation through the real
 * creation entry, then verifies the read contract with a fresh database and a
 * fresh collection client (no cached rows).
 *
 * Two bindings are supported, with identical assertions:
 *   1. self-booted local Xpod (default), where the collection case is RED
 *      because the installed runtime lacks directory-metadata reads;
 *   2. an externally owned CLOUD/PG Gateway running the fixed backend, selected
 *      only by test-harness env (`XPOD_JOINT_RUNTIME_FILE` +
 *      `XPOD_JOINT_SEED_CONFIG`). In that mode the collection case must be GREEN.
 *
 * The desired collection-membership assertions are never skipped, weakened, or
 * replaced with a `.meta` GET shortcut.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { drizzle } from '@undefineds.co/drizzle-solid'
import {
  agentResource,
  aiProviderResource,
  chatResource,
  contactResource,
  credentialResource,
  messageResource,
  solidSchema,
  threadResource,
  type AgentRow,
} from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'
import { buildAgentHomePath, updateAgentHomeMetadata } from './agent-home'
import { createPodCollection } from './pod-collection'
import {
  agentCollection,
  configureContactsChatPort,
  contactCollection,
  contactOps,
  initializeContactCollections,
} from '@/modules/contacts/data/collections'
import {
  chatCollection,
  chatOps,
  configureChatContactsPort,
  initializeChatCollections,
  LINX_DEFAULT_SECRETARY,
  threadCollection,
} from '@/modules/chat/data/collections'

const SUPPORTED_RESOURCES = [
  chatResource,
  threadResource,
  messageResource,
  contactResource,
  agentResource,
  aiProviderResource,
  credentialResource,
] as const

let context: XpodIntegrationContext<typeof solidSchema> | null = null
let reloadDb: Awaited<ReturnType<typeof createReloadDatabase>> | null = null
const cleanupUrls: string[] = []
// Canonical base-relative row ids only. IRIs are resolved through the shared
// contactResource contract at cleanup time, never parsed or reused from links.
const cleanupContactIds: string[] = []
const cleanupChatIds: string[] = []

/**
 * Test-harness-only binding to an externally owned Gateway. Selected purely by
 * env; product behavior is unchanged when those env vars are absent.
 */
interface CoupledHarness {
  readJointRuntimeDescriptor(file: string): { baseUrl: string }
  ensureTrailingSlash(url: string): string
  createJointSession(options: { descriptorFile: string; seedFile: string }): Promise<{
    webId: string
    podUrl: string
    fetch: typeof fetch
  }>
}

function getCoupledRuntimeEnv(): { descriptorFile: string; seedFile: string; harnessFile: string } | null {
  const descriptorFile = process.env.XPOD_JOINT_RUNTIME_FILE?.trim()
  const seedFile = process.env.XPOD_JOINT_SEED_CONFIG?.trim()
  if (!descriptorFile && !seedFile) return null
  if (!descriptorFile || !seedFile) {
    throw new Error('Coupled mode requires both XPOD_JOINT_RUNTIME_FILE and XPOD_JOINT_SEED_CONFIG')
  }
  // The harness lives outside the product tree; a tracked test may not import a
  // private path statically, so it is provided explicitly by the test run.
  const harnessFile = process.env.LINX_AGENT_HOME_TEST_HARNESS?.trim()
  if (!harnessFile) {
    throw new Error('Coupled mode requires LINX_AGENT_HOME_TEST_HARNESS to point at the harness module')
  }
  return { descriptorFile, seedFile, harnessFile }
}

async function loadCoupledHarness(file: string): Promise<CoupledHarness> {
  const loaded = await import(/* @vite-ignore */ new URL(`file://${file}`).href) as CoupledHarness
  return loaded
}

async function createCoupledContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  const env = getCoupledRuntimeEnv()
  if (!env) throw new Error('createCoupledContext called without coupled env')
  const harness = await loadCoupledHarness(env.harnessFile)
  const descriptor = harness.readJointRuntimeDescriptor(env.descriptorFile)
  const session = await harness.createJointSession({
    descriptorFile: env.descriptorFile,
    seedFile: env.seedFile,
  })
  const db = drizzle({
    info: { isLoggedIn: true, webId: session.webId, sessionId: 'agent-home-coupled' },
    fetch: session.fetch,
  }, {
    disableInteropDiscovery: true,
    podUrl: session.podUrl,
    schema: solidSchema,
  })
  await db.init([...SUPPORTED_RESOURCES])
  return {
    mode: 'external-auth',
    db: db as any,
    baseUrl: harness.ensureTrailingSlash(descriptor.baseUrl),
    webId: session.webId,
    podUrl: session.podUrl,
    authenticatedFetch: session.fetch,
    requestMetrics: [],
    setupMetrics: { totalMs: 0, runtimeStartMs: 0, authenticationMs: 0, databaseInitMs: 0 },
    stop: async () => { await db.disconnect().catch(() => undefined) },
  }
}

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = getCoupledRuntimeEnv()
    ? await createCoupledContext()
    : await createXpodIntegrationContext({
      schema: solidSchema,
      resources: [...SUPPORTED_RESOURCES],
    })
  await initializeContactCollections(context.db)
  configureChatContactsPort({ agentCollection, contactCollection })
  configureContactsChatPort({
    chatCollection,
    threadCollection,
    useSelectChat: () => () => undefined,
    createMatrixGroupRoom: async () => {
      throw new Error('Matrix group rooms are not part of the Agent metadata contract test.')
    },
    loadMatrixChatRow: async () => null,
    loadMatrixThreadRow: async () => null,
  })
  await initializeChatCollections(context.db)
  return context
}

/**
 * A separate ORM client built from the runtime access token (or, in
 * external-auth mode, the fixture fetch). No collection cache or earlier query
 * result is reused, so this models a fresh login/read.
 */
async function createReloadDatabase(active: XpodIntegrationContext<typeof solidSchema>) {
  const shared = active.sharedRuntimeConfig
  const fetchFn: typeof fetch = shared
    ? (input, init) => {
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${shared.accessToken}`)
      return fetch(
        typeof input === 'string' || input instanceof URL
          ? new URL(String(input), shared.baseUrl)
          : input,
        { ...init, headers },
      )
    }
    : active.authenticatedFetch
  const db = drizzle({
    info: { isLoggedIn: true, webId: active.webId, sessionId: 'agent-home-reload' },
    fetch: fetchFn,
  }, {
    disableInteropDiscovery: true,
    podUrl: active.podUrl,
    schema: solidSchema,
  })
  await db.init([...SUPPORTED_RESOURCES])
  return db
}

async function getReloadDb() {
  reloadDb ??= await createReloadDatabase(await getContext())
  return reloadDb
}

async function readTurtle(url: string): Promise<string> {
  const response = await context!.authenticatedFetch(url, { headers: { Accept: 'text/turtle' } })
  const body = await response.text()
  expect(response.ok, `${url} -> ${response.status}: ${body}`).toBe(true)
  return body
}

/**
 * Read a date literal from server Turtle without assuming predicate form: real
 * Pods may return the full IRI or a compacted prefix (for example `dc:created`).
 */
/** Agent Home path is Pod-base-relative (`/agents/{key}/`), not host-root. */
function agentHomeUrl(podUrl: string, agentId: string, file = ''): string {
  // podUrl may or may not already end with a slash; normalize before joining so
  // the path never becomes `pod//agents/...` (which the server treats as 401).
  const base = podUrl.endsWith('/') ? podUrl : `${podUrl}/`
  return new URL(`${buildAgentHomePath(agentId).replace(/^\/+/, '')}${file}`, base).toString()
}

function readDateLiteral(turtle: string, predicate: string, compact: string): Date | null {
  const value = turtle.match(
    new RegExp(`(?:<${predicate}>|\\b${compact})\\s+"([^"]+)"`),
  )?.[1]
  return value ? new Date(value) : null
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`)
}

async function readFreshAgentCollection(): Promise<AgentRow[]> {
  const db = await getReloadDb()
  const queryClient = new QueryClient()
  const collection = createPodCollection<typeof agentResource, AgentRow, any>({
    resource: agentResource,
    queryKey: ['agent-metadata-contract-fresh', crypto.randomUUID()],
    queryClient,
    getDb: () => db as any,
  })
  try {
    await collection.fetch({ refetch: true })
    return collection.toArray as AgentRow[]
  } finally {
    await collection.cleanup()
    queryClient.clear()
  }
}

afterAll(async () => {
  try {
    for (const url of cleanupUrls) {
      await context?.authenticatedFetch(url, { method: 'DELETE' }).catch(() => undefined)
    }
    const db = reloadDb as any
    if (db && context) {
      for (const [resource, rowId] of [
        ...cleanupChatIds.map((id) => [chatResource, id] as const),
        ...cleanupContactIds.map((id) => [contactResource, id] as const),
      ]) {
        // `deleteByIri` needs the resource's own IRI; derive it from the typed
        // row id via the ORM, using the same resource contract that created it.
        const iri = context.db.resolveRowIri(resource as any, { id: rowId })
        if (iri) await db.deleteByIri(resource as any, iri).catch(() => undefined)
      }
    }
  } finally {
    await (reloadDb as any)?.disconnect?.().catch(() => undefined)
    await context?.stop()
  }
}, 90_000)

describe('Agent Home required metadata on a real Pod', () => {
  it('writes createdAt at creation and keeps the row readable by exact id after reload', { timeout: 150_000 }, async () => {
    const active = await getContext()
    const assistantName = `Contract Assistant ${crypto.randomUUID()}`

    const created = await contactOps.createAgent({
      name: assistantName,
      instructions: 'Explain the metadata contract.',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })
    // The receipt returns the Contact row: `id` is its canonical base-relative
    // row id, while `about` is the Agent IRI. Cleanup must delete the Contact by
    // its own id, never by the Agent IRI it links to.
    const about = (created as unknown as { about?: string }).about
    expect(about, 'created contact must link to its Agent').toBeTruthy()
    cleanupContactIds.push(created.id)
    cleanupChatIds.push(chatResource.buildId({ id: created.chatId }))

    const freshDb = await getReloadDb()
    const byIri = await (freshDb as any).findByIri(agentResource, about) as AgentRow | null
    expect(byIri, `findByIri(${about}) after reload`).toBeTruthy()
    const agentId = byIri!.id
    const row = await (freshDb as any).findById(agentResource, agentId) as AgentRow | null
    expect(row, `findById(${agentId}) after reload`).toBeTruthy()
    expect(row!.name).toBe(assistantName)
    expect(row!.createdAt).toBeInstanceOf(Date)
    expect(row!.updatedAt).toBeInstanceOf(Date)
    expect(Number.isNaN(row!.createdAt.getTime())).toBe(false)
    expect(Number.isNaN(row!.updatedAt.getTime())).toBe(false)

    // The .meta RDF graph carries the same app-owned creation time, and the
    // server's own modified timestamp is present without us writing it.
    const metaUrl = agentHomeUrl(active.podUrl, row!.id, '.meta')
    cleanupUrls.push(
      metaUrl,
      agentHomeUrl(active.podUrl, row!.id, 'AGENTS.md'),
      agentHomeUrl(active.podUrl, row!.id, 'skills/README.md'),
    )
    const turtle = await readTurtle(metaUrl)
    const createdOnPod = readDateLiteral(turtle, agentResource.createdAt.getPredicate(), 'dc:created')
    const modifiedOnPod = readDateLiteral(turtle, agentResource.updatedAt.getPredicate(), 'dc:modified')
    expect(createdOnPod, turtle).not.toBeNull()
    expect(modifiedOnPod, turtle).not.toBeNull()
    expect(createdOnPod!.toISOString()).toBe(row!.createdAt.toISOString())
    // dcterms:modified is Pod-owned on .meta and may be truncated to whole
    // seconds by the server, so compare at second precision rather than ms.
    expect(Math.floor(modifiedOnPod!.getTime() / 1000))
      .toBeGreaterThanOrEqual(Math.floor(createdOnPod!.getTime() / 1000))

    // Edit after reload through the documented metadata boundary. Creation time
    // must survive and the server must advance its own modified timestamp.
    const renamed = `${assistantName} edited`
    await updateAgentHomeMetadata(freshDb as any, row!.id, { name: renamed }, row!)
    const edited = await (freshDb as any).findById(agentResource, row!.id) as AgentRow | null
    expect(edited!.name).toBe(renamed)
    expect(edited!.createdAt.toISOString()).toBe(row!.createdAt.toISOString())
    expect(edited!.updatedAt.getTime()).toBeGreaterThanOrEqual(row!.updatedAt.getTime())
  })

  it('persists the current-Pod default assistant home with the row creation time', { timeout: 150_000 }, async () => {
    const active = await getContext()
    await chatCollection.fetch()
    await threadCollection.fetch()

    await chatOps.ensureLinxWelcome({ force: true })

    const metaUrl = agentHomeUrl(active.podUrl, LINX_DEFAULT_SECRETARY.agentId, '.meta')
    cleanupUrls.push(metaUrl)

    await waitFor(async () => {
      const response = await active.authenticatedFetch(metaUrl, { headers: { Accept: 'text/turtle' } })
      if (!response.ok) return false
      return readDateLiteral(
        await response.text(),
        agentResource.createdAt.getPredicate(),
        'dc:created',
      ) !== null
    })

    const turtle = await readTurtle(metaUrl)
    const createdOnPod = readDateLiteral(turtle, agentResource.createdAt.getPredicate(), 'dc:created')
    expect(createdOnPod, turtle).not.toBeNull()
    // The home was created by the bootstrap, so the row must resolve by id with
    // real timestamps rather than falling back to "shared reference" state.
    const freshDb = await getReloadDb()
    const row = await (freshDb as any).findById(
      agentResource,
      LINX_DEFAULT_SECRETARY.agentId,
    ) as AgentRow | null
    expect(row).toBeTruthy()
    expect(row!.createdAt).toBeInstanceOf(Date)
    expect(row!.updatedAt).toBeInstanceOf(Date)
    expect(createdOnPod!.toISOString()).toBe(row!.createdAt.toISOString())
  })

  it('fresh real collection contains the newly created Agent with required fields', { timeout: 120_000 }, async () => {
    await getContext()
    const assistantName = `Collection Assistant ${crypto.randomUUID()}`

    const created = await contactOps.createAgent({
      name: assistantName,
      instructions: 'Must be visible in the current Pod agent collection.',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })
    const about = (created as unknown as { about?: string }).about
    expect(about, 'created contact must link to its Agent').toBeTruthy()
    cleanupContactIds.push(created.id)
    cleanupChatIds.push(chatResource.buildId({ id: created.chatId }))

    // Desired contract: an assistant created in this Pod must appear in the
    // Pod's own agent collection after a fresh client reload, with both required
    // timestamps. This is what makes the UI treat it as own/editable.
    //
    // KNOWN RED (blocked on xpod#208, linked from LinX#68): a container `.meta`
    // graph is not exposed through the `/agents/-/sparql` index, so this
    // assertion legitimately fails until the backend read contract is fixed.
    // It is intentionally NOT skipped, mocked, or relaxed to match the bug.
    // The receipt identifies the Contact; the Agent is the resource that Contact
    // links to. Resolve the Agent row id through the shared ORM contract instead
    // of hand-parsing the link IRI.
    const freshDb = await getReloadDb()
    const agentRowId = (freshDb as any).resolveResourceId(agentResource, about)
    expect(agentRowId).toBeTruthy()

    const freshAgents = await readFreshAgentCollection()
    const createdAgent = freshAgents.find((candidate) => candidate.id === agentRowId)
    expect(createdAgent, `fresh collection must contain ${agentRowId}`).toBeTruthy()
    expect(createdAgent!.name).toBe(assistantName)
    expect(createdAgent!.createdAt).toBeInstanceOf(Date)
    expect(createdAgent!.updatedAt).toBeInstanceOf(Date)
    expect(Number.isNaN(createdAgent!.createdAt.getTime())).toBe(false)
    expect(Number.isNaN(createdAgent!.updatedAt.getTime())).toBe(false)
  })
})
