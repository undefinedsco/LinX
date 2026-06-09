import {
  agentHomePathFromResourceId,
  aiConfigModelRef,
  aiConfigProviderRef,
  getDefaultAIConfigCredentialId,
  type BaseRelativeResourceId,
  type SolidDatabase,
} from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'

export interface EnsureAgentHomeInput {
  agentId: BaseRelativeResourceId
  name: string
  provider: string
  model: string
  instructions?: string
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

export async function ensureAgentHome(db: SolidDatabase, input: EnsureAgentHomeInput): Promise<void> {
  const fetchFn = getAuthenticatedFetch(db)
  if (!fetchFn) {
    throw new Error('Solid database is missing authenticated fetch.')
  }

  const homePath = buildAgentHomePath(input.agentId)
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
}
