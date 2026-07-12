import {
  aiConfigModelRef,
  aiConfigProviderRef,
  getDefaultAIConfigCredentialId,
  type SolidDatabase,
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
    throw new Error(`Failed to update Pod metadata ${metadataUrl}: HTTP ${response.status}`)
  }
}

async function agentHomeExists(fetchFn: typeof fetch, homeUrl: string): Promise<boolean> {
  const response = await fetchFn(homeUrl, { method: 'HEAD' })
  if (response.ok) return true
  if (response.status === 404) return false
  throw new Error(`Failed to inspect Agent Home ${homeUrl}: HTTP ${response.status}`)
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
    '  a udfs:AgentConfig ;',
    `  foaf:name ${toTurtleString(input.name)} ;`,
    `  udfs:provider <${providerRef}> ;`,
    `  udfs:credential <${credentialRef}> ;`,
    `  udfs:model <${modelRef}> ;`,
    '  udfs:runtimeKind "codex" ;',
    '  udfs:enabled "true" ;',
    '  udfs:permissionMode "acceptEdits" ;',
    '  udfs:maxTurns 20' + (instructions ? ' ;' : ' .'),
    ...(instructions ? [
      `  udfs:systemPrompt ${toTurtleString(instructions)} .`,
    ] : []),
    '}',
    '',
  ].join('\n')
}

function toTurtleString(value: string): string {
  return JSON.stringify(value)
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
        await patchPodMetadata(fetchFn, fileUrl, buildAgentMetaSparqlInsert(input, fileUrl))
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
