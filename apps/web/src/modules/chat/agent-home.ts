import type { SolidDatabase } from '@undefineds.co/models'

export interface EnsureAgentHomeInput {
  agentId: string
  name: string
  provider: string
  model: string
  instructions?: string
}

function getPodBaseUrl(db: SolidDatabase): string | null {
  const podUrl = (db as any).getDialect?.()?.getPodUrl?.()
  if (typeof podUrl === 'string' && podUrl.length > 0) {
    return podUrl.replace(/\/$/, '')
  }

  const webId = (db as any).getSession?.()?.info?.webId
  if (typeof webId !== 'string' || !webId.includes('/profile/card#me')) {
    return null
  }
  return webId.replace('/profile/card#me', '')
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

async function ensurePodContainer(fetchFn: typeof fetch, containerUrl: string): Promise<void> {
  const target = containerUrl.endsWith('/') ? containerUrl : `${containerUrl}/`
  const head = await fetchFn(target, { method: 'HEAD' })
  if (head.ok || head.status === 409) return

  if (head.status !== 404 && head.status !== 405) {
    throw new Error(`Failed to check Pod container ${target}: HTTP ${head.status}`)
  }

  const response = await fetchFn(target, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/turtle',
      Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
    },
    body: '@prefix ldp: <http://www.w3.org/ns/ldp#> .\n',
  })

  if (!response.ok && response.status !== 409) {
    throw new Error(`Failed to create Pod container ${target}: HTTP ${response.status}`)
  }
}

async function putPodFileIfMissing(
  fetchFn: typeof fetch,
  fileUrl: string,
  body: string,
  contentType: string,
): Promise<void> {
  const head = await fetchFn(fileUrl, { method: 'HEAD' })
  if (head.ok) return
  if (head.status !== 404 && head.status !== 405) {
    throw new Error(`Failed to check Pod file ${fileUrl}: HTTP ${head.status}`)
  }

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

export function buildAgentHomePath(agentId: string): string {
  return `/.data/agents/${encodeURIComponent(agentId)}/`
}

function buildAgentHomeFiles(input: EnsureAgentHomeInput): Array<{ path: string; body: string; contentType: string }> {
  const config = {
    version: 1,
    agent: {
      id: input.agentId,
      name: input.name,
    },
    backend: {
      provider: input.provider,
      model: input.model,
    },
    compaction: {
      mode: 'auto',
      keepRecentTurns: 20,
    },
    skills: {
      enabled: [] as string[],
    },
    mcp: {
      servers: {} as Record<string, unknown>,
    },
  }

  const agentsMd = [
    `# ${input.name}`,
    '',
    'This directory is the Agent Home for this LinX agent.',
    '',
    '- Read `config.json` for backend, model, skills, MCP, and compaction defaults.',
    '- Read `rules.md` before using tools or touching user data.',
    '- Treat this Agent Home as the instruction root. Runtime sessions and workspaces do not own agent rules.',
    '- Keep durable agent memory and configuration here; keep transient runtime state in sessions.',
    '',
    input.instructions?.trim() ? '## Instructions\n\n' + input.instructions.trim() + '\n' : '',
  ].filter(Boolean).join('\n')

  const rules = [
    '# Rules',
    '',
    '- Ask for approval before destructive file operations.',
    '- Prefer read-only inspection before editing.',
    '- Keep workspace changes scoped to the active task.',
    '- Record durable preferences in Agent Home, not in transient runtime state.',
    '',
  ].join('\n')

  return [
    { path: 'AGENTS.md', body: agentsMd, contentType: 'text/markdown; charset=utf-8' },
    { path: 'config.json', body: JSON.stringify(config, null, 2) + '\n', contentType: 'application/json; charset=utf-8' },
    { path: 'rules.md', body: rules, contentType: 'text/markdown; charset=utf-8' },
    { path: 'mcp.json', body: JSON.stringify({ servers: {} }, null, 2) + '\n', contentType: 'application/json; charset=utf-8' },
    { path: 'skills/README.md', body: '# Skills\n\nAgent-specific skills can be added here.\n', contentType: 'text/markdown; charset=utf-8' },
    { path: 'memory.md', body: '# Memory\n\nDurable agent memory notes can be added here.\n', contentType: 'text/markdown; charset=utf-8' },
  ]
}

export async function ensureAgentHome(db: SolidDatabase, input: EnsureAgentHomeInput): Promise<void> {
  const fetchFn = getAuthenticatedFetch(db)
  if (!fetchFn) {
    throw new Error('Solid database is missing authenticated fetch.')
  }

  const homePath = buildAgentHomePath(input.agentId)
  await ensurePodContainer(fetchFn, resolvePodPath(db, homePath))
  await ensurePodContainer(fetchFn, resolvePodPath(db, `${homePath}skills/`))

  for (const file of buildAgentHomeFiles(input)) {
    await putPodFileIfMissing(
      fetchFn,
      resolvePodPath(db, `${homePath}${file.path}`),
      file.body,
      file.contentType,
    )
  }
}
