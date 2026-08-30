import {
  aiConfigModelRef,
  aiConfigProviderRef,
  getDefaultAIConfigCredentialId,
  type SolidDatabase,
  type AgentRow,
} from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from './current-pod-base'
import {
  agentHomePathFromResourceId,
  type BaseRelativeResourceId,
} from './resource-identity'

export interface EnsureAgentHomeInput {
  agentId: BaseRelativeResourceId
  name: string
  provider: string
  model: string
  instructions?: string
}

export interface AgentHomeCreationReceipt {
  created: boolean
  rollback: () => Promise<void>
}

function getPodBaseUrl(db: SolidDatabase): string | null {
  return resolveCurrentPodBaseUrl(db)
}

function getAuthenticatedFetch(db: SolidDatabase): typeof fetch | null {
  const candidate = (
    (db as any).getDialect?.()?.getAuthenticatedFetch?.()
    ?? (db as any).getSession?.()?.fetch
    ?? (db as any).session?.fetch
  )

  return typeof candidate === 'function' ? candidate.bind((db as any).session) as typeof fetch : null
}

function resolvePodPath(db: SolidDatabase, path: string): string {
  const podBaseUrl = getPodBaseUrl(db)
  if (!podBaseUrl) {
    throw new Error('无法解析 Pod 地址，无法初始化 Agent Home。')
  }

  return new URL(path.replace(/^\/+/, ''), `${podBaseUrl}/`).toString()
}

async function putPodFileIfMissing(
  fetchFn: typeof fetch,
  fileUrl: string,
  body: string,
  contentType: string,
): Promise<void> {
  const response = await fetchFn(fileUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'If-None-Match': '*',
    },
    body,
  })

  if (!response.ok && response.status !== 412) {
    throw new Error(`Failed to create Pod file ${fileUrl}: HTTP ${response.status}`)
  }
}

async function patchPodMetadata(
  fetchFn: typeof fetch,
  metadataUrl: string,
  body: string,
): Promise<void> {
  const response = await fetchFn(metadataUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/sparql-update',
    },
    body,
  })

  if (!response.ok) {
    const details = (await response.text().catch(() => '')).trim()
    throw new Error(`Failed to update Pod metadata ${metadataUrl}: HTTP ${response.status}${details ? ` — ${details}` : ''}`)
  }
}

async function agentHomeExists(fetchFn: typeof fetch, homeUrl: string): Promise<boolean> {
  return podResourceExists(fetchFn, homeUrl)
}

async function podResourceExists(fetchFn: typeof fetch, resourceUrl: string): Promise<boolean> {
  const response = await fetchFn(resourceUrl, { method: 'HEAD' })
  if (response.ok) return true
  if (response.status === 404) return false
  throw new Error(`Failed to inspect Pod resource ${resourceUrl}: HTTP ${response.status}`)
}

async function readAgentMetadata(fetchFn: typeof fetch, metadataUrl: string): Promise<string | null> {
  const response = await fetchFn(metadataUrl, { headers: { Accept: 'text/turtle' } })
  return response.ok ? response.text() : null
}

function buildAgentSchemaTypeInsert(metadataUrl: string): string {
  const subjectRef = metadataUrl.endsWith('.meta') ? metadataUrl.slice(0, -'.meta'.length) : metadataUrl
  return `INSERT DATA { <${subjectRef}> a <http://xmlns.com/foaf/0.1/Agent> . }`
}

async function deletePodResource(fetchFn: typeof fetch, resourceUrl: string): Promise<void> {
  const response = await fetchFn(resourceUrl, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete Pod resource ${resourceUrl}: HTTP ${response.status}`)
  }
}

function createAgentHomeRollback(fetchFn: typeof fetch, homeUrl: string, created: boolean) {
  let rolledBack = false

  return async () => {
    if (!created || rolledBack) return

    const targets = [
      `${homeUrl}skills/README.md`,
      `${homeUrl}skills/`,
      `${homeUrl}.meta`,
      `${homeUrl}AGENTS.md`,
      homeUrl,
    ]
    let firstError: unknown
    for (const target of targets) {
      try {
        await deletePodResource(fetchFn, target)
      } catch (error) {
        firstError ??= error
      }
    }
    if (firstError) throw firstError
    rolledBack = true
  }
}

export function buildAgentHomePath(agentId: string): string {
  return agentHomePathFromResourceId(agentId)
}

function buildAgentHomeFiles(input: EnsureAgentHomeInput): Array<{
  path: string
  body: string
  contentType: string
  writeMode?: 'patch-metadata'
}> {
  const agentsMd = [
    `# ${input.name}`,
    '',
    'This directory is the Agent Home for this LinX agent.',
    '',
    '- Read `.meta` for backend, model, skills, MCP, and compaction defaults.',
    '- Treat this Agent Home as the instruction root. Runtime sessions and workspaces do not own agent rules.',
    '- Keep durable agent preferences here; keep transient runtime state in sessions.',
    '- If the AI runtime runs on the client, access Pod workspaces through the xpod CLI; do not treat the Pod as a local folder.',
    '- If the AI runtime runs on server/xpod, Pod storage may be exposed as a local folder implementation detail.',
    '',
    input.instructions?.trim() ? '## Instructions\n\n' + input.instructions.trim() + '\n' : '',
  ].filter(Boolean).join('\n')

  return [
    { path: 'AGENTS.md', body: agentsMd, contentType: 'text/markdown; charset=utf-8' },
    { path: '.meta', body: '', contentType: 'text/turtle; charset=utf-8', writeMode: 'patch-metadata' },
    { path: 'skills/README.md', body: '# Skills\n\nAgent-specific skills can be added here.\n', contentType: 'text/markdown; charset=utf-8' },
  ]
}

function buildAgentMetaSparqlInsert(input: EnsureAgentHomeInput, metadataUrl: string): string {
  const providerId = input.provider
  const modelId = input.model
  const providerRef = aiConfigProviderRef(providerId)
  const modelRef = aiConfigModelRef(providerId, modelId)
  const credentialRef = `/settings/credentials.ttl#${getDefaultAIConfigCredentialId(providerId)}`
  const instructions = input.instructions?.trim()
  const subjectRef = metadataUrl.endsWith('.meta') ? metadataUrl.slice(0, -'.meta'.length) : metadataUrl

  return [
    `BASE <${metadataUrl}>`,
    'PREFIX udfs: <https://undefineds.co/ns#>',
    'PREFIX foaf: <http://xmlns.com/foaf/0.1/>',
    '',
    'INSERT DATA {',
    `<${subjectRef}>`,
    '  a foaf:Agent, udfs:AgentConfig ;',
    `  foaf:name ${toTurtleString(input.name)} ;`,
    `  udfs:provider <${providerRef}> ;`,
    `  udfs:credential <${credentialRef}> ;`,
    `  udfs:model <${modelRef}> ;`,
    '  udfs:runtimeKind "codex" ;',
    '  udfs:enabled "true" ;',
    '  udfs:permissionMode "acceptEdits" ;',
    '  udfs:maxTurns 20' + (instructions ? ' ;' : ' .'),
    ...(instructions ? [
      `  udfs:systemMessage ${toTurtleString(instructions)} .`,
    ] : []),
    '}',
    '',
  ].join('\n')
}

function toTurtleString(value: string): string {
  return JSON.stringify(value)
}

function toTurtleJson(value: unknown): string {
  return `${JSON.stringify(JSON.stringify(value))}^^<http://www.w3.org/2001/XMLSchema#json>`
}

function toTurtleDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  return `${JSON.stringify(date.toISOString())}^^<http://www.w3.org/2001/XMLSchema#dateTime>`
}

const AGENT_UPDATE_PREDICATES: Partial<Record<keyof AgentRow, string>> = {
  name: 'http://xmlns.com/foaf/0.1/name',
  instructions: 'https://undefineds.co/ns#systemMessage',
  provider: 'https://undefineds.co/ns#provider',
  model: 'https://undefineds.co/ns#model',
  tools: 'https://undefineds.co/ns#tools',
  metadata: 'https://undefineds.co/ns#metadata',
  avatarUrl: 'http://www.w3.org/2006/vcard/ns#hasPhoto',
  updatedAt: 'http://purl.org/dc/terms/modified',
}

function formatAgentUpdateValues(field: keyof AgentRow, value: unknown, provider: unknown): string[] {
  if (field === 'tools') {
    return Array.isArray(value) ? value.map((entry) => toTurtleString(String(entry))) : []
  }
  if (field === 'metadata') return [toTurtleJson(value)]
  if (field === 'updatedAt') return [toTurtleDate(value as Date | string)]
  if (field === 'avatarUrl') return [`<${String(value)}>`]
  if (field === 'provider') return [`<${aiConfigProviderRef(String(value))}>`]
  if (field === 'model') return [`<${aiConfigModelRef(String(provider ?? ''), String(value))}>`]
  return [toTurtleString(String(value))]
}

function agentFieldValuesEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Date || right instanceof Date) {
    return new Date(left as Date | string).getTime() === new Date(right as Date | string).getTime()
  }
  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  return left === right
}

/**
 * Persist mutable Agent fields in the Agent Home metadata sidecar.
 *
 * Agent rows use a directory resource id (`agents/{key}/`), while their RDF graph
 * lives in `agents/{key}/.meta`. Sending PATCH to the directory itself makes xpod
 * attempt to open a directory as a file, so Agent Home mutations must use this
 * sidecar-aware path instead of the generic collection update writer.
 */
export async function updateAgentHomeMetadata(
  db: SolidDatabase,
  agentId: BaseRelativeResourceId,
  changes: Partial<Pick<AgentRow,
    'name' | 'instructions' | 'provider' | 'model' | 'tools' | 'metadata' | 'avatarUrl' | 'updatedAt'
  >>,
  previous: Partial<AgentRow> = {},
): Promise<void> {
  const fetchFn = getAuthenticatedFetch(db)
  if (!fetchFn) throw new Error('Solid database is missing authenticated fetch.')

  const homeUrl = resolvePodPath(db, buildAgentHomePath(agentId))
  const metadataUrl = `${homeUrl}.meta`
  const entries = Object.entries(changes).filter(([field, value]) =>
    value !== undefined && !agentFieldValuesEqual(value, previous[field as keyof AgentRow])
  )
  if (entries.length === 0) return

  const inserts = entries
    .filter(([, value]) => value !== null && value !== '')
    .flatMap(([field, value]) => formatAgentUpdateValues(
      field as keyof AgentRow,
      value,
      changes.provider ?? previous.provider,
    ).map((object) =>
      `<${homeUrl}> <${AGENT_UPDATE_PREDICATES[field as keyof AgentRow]}> ${object} .`
    ))

  // Community Solid Server's patcher only accepts basic graph patterns in
  // WHERE (no OPTIONAL), and rejects DELETE-WHERE-only updates. The caller has
  // the collection row already, so delete its exact previous values first.
  const deletes = entries
    .filter(([field]) => previous[field as keyof AgentRow] !== undefined && previous[field as keyof AgentRow] !== '')
    .flatMap(([field]) => {
      const key = field as keyof AgentRow
      return formatAgentUpdateValues(key, previous[key], previous.provider).map((object) =>
        `<${homeUrl}> <${AGENT_UPDATE_PREDICATES[key]}> ${object} .`
      )
    })
  const updates = [
    deletes.length > 0 ? `DELETE DATA { ${deletes.join(' ')} }` : '',
    inserts.length > 0 ? `INSERT DATA { ${inserts.join(' ')} }` : '',
  ].filter(Boolean)
  if (updates.length > 0) await patchPodMetadata(fetchFn, metadataUrl, updates.join(';\n'))
}

export async function createAgentHome(
  db: SolidDatabase,
  input: EnsureAgentHomeInput,
): Promise<AgentHomeCreationReceipt> {
  const fetchFn = getAuthenticatedFetch(db)
  if (!fetchFn) {
    throw new Error('Solid database is missing authenticated fetch.')
  }

  const homePath = buildAgentHomePath(input.agentId)
  const homeUrl = resolvePodPath(db, homePath)
  const created = !await agentHomeExists(fetchFn, homeUrl)
  const rollback = createAgentHomeRollback(fetchFn, homeUrl, created)

  try {
    for (const file of buildAgentHomeFiles(input)) {
      const fileUrl = resolvePodPath(db, `${homePath}${file.path}`)
      if (file.writeMode === 'patch-metadata') {
        const existingMetadata = created ? null : await readAgentMetadata(fetchFn, fileUrl)
        if (existingMetadata?.includes('http://xmlns.com/foaf/0.1/Agent')) continue
        const patch = existingMetadata?.includes('https://undefineds.co/ns#AgentConfig')
          ? buildAgentSchemaTypeInsert(fileUrl)
          : buildAgentMetaSparqlInsert(input, fileUrl)
        await patchPodMetadata(fetchFn, fileUrl, patch)
        continue
      }

      if (!created && await podResourceExists(fetchFn, fileUrl)) {
        continue
      }

      await putPodFileIfMissing(
        fetchFn,
        fileUrl,
        file.body,
        file.contentType,
      )
    }
  } catch (error) {
    try {
      await rollback()
    } catch {
      // Initialization failure remains authoritative over best-effort cleanup.
    }
    throw error
  }

  return { created, rollback }
}

export async function ensureAgentHome(db: SolidDatabase, input: EnsureAgentHomeInput): Promise<void> {
  await createAgentHome(db, input)
}
