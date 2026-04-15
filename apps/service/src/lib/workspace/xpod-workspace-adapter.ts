import * as fs from 'fs'
import * as path from 'path'
import { getWebServerModule } from '../web-server'
import { getXpodModule, type XpodStatus } from '../xpod'
import type {
  AuthorizedWorkspacePrimitive,
  AuthorizedWorkspaceSnapshot,
  AuthorizedWorkspaceSource,
} from './types'

export interface XpodWorkspaceAdapterOptions {
  envPath?: string
  statusProvider?: () => XpodStatus
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function readEnvFile(envPath: string): Record<string, string> {
  const env: Record<string, string> = {}
  if (!fs.existsSync(envPath)) {
    return env
  }

  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/)
    if (match) {
      env[match[1]] = match[2]
    }
  }
  return env
}

function listPodDirectories(dataRoot: string): string[] {
  if (!fs.existsSync(dataRoot)) {
    return []
  }

  return fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
}

function podNameFromWebId(webId: string): string | undefined {
  try {
    const url = new URL(webId)
    return url.pathname.split('/').filter(Boolean)[0]
  } catch {
    return undefined
  }
}

function podNameFromBaseUrl(podBaseUrl: string): string | undefined {
  try {
    const url = new URL(podBaseUrl)
    return url.pathname.split('/').filter(Boolean)[0]
  } catch {
    return undefined
  }
}

/**
 * Local embedded-xpod implementation of the generic AuthorizedWorkspaceSource contract.
 *
 * The workspace model belongs to Linx. This class is only a local primitive provider
 * for the current service mode. A future remote/cloud implementation should satisfy the
 * same contract without requiring xpod itself to own the final workspace UX.
 */
export class XpodWorkspaceAdapter implements AuthorizedWorkspaceSource {
  private readonly envPath: string
  private readonly statusProvider: () => XpodStatus

  public constructor(options: XpodWorkspaceAdapterOptions = {}) {
    this.envPath = options.envPath ?? getWebServerModule().getEnvPath()
    this.statusProvider = options.statusProvider ?? (() => getXpodModule().getStatus())
  }

  public getSnapshot(): AuthorizedWorkspaceSnapshot {
    const env = readEnvFile(this.envPath)
    const status = this.statusProvider()
    const xpodBaseUrl = ensureTrailingSlash(status.baseUrl || env.CSS_BASE_URL || 'http://localhost:5737/')
    const dataRoot = env.CSS_ROOT_FILE_PATH || path.join(process.env.HOME || '', 'Library', 'Application Support', 'LinX', 'pod')
    const projectionRoot = path.join(dataRoot, '.xpod-ai')
    const availablePodNames = listPodDirectories(dataRoot)

    return {
      source: 'local-embedded-xpod',
      running: status.running,
      baseUrl: xpodBaseUrl,
      dataRoot,
      projectionRoot: fs.existsSync(projectionRoot) ? projectionRoot : undefined,
      availablePodNames,
    }
  }

  public resolveAuthorizedPrimitives(input: {
    ownerWebId?: string
    podBaseUrls?: string[]
  }): {
    snapshot: AuthorizedWorkspaceSnapshot
    primitives: AuthorizedWorkspacePrimitive[]
  } {
    const snapshot = this.getSnapshot()

    const explicitPodNames = (input.podBaseUrls ?? [])
      .map((url) => podNameFromBaseUrl(url))
      .filter((value): value is string => Boolean(value))

    const ownerPodName = input.ownerWebId ? podNameFromWebId(input.ownerWebId) : undefined

    if (explicitPodNames.length > 0 && !ownerPodName) {
      throw new Error('Explicit pod selection requires an ownerWebId in the current MVP')
    }

    if (ownerPodName && explicitPodNames.some((podName) => podName !== ownerPodName)) {
      throw new Error('Explicit pod selection cannot exceed the owner pod in the current MVP')
    }

    const selectedPodNames = explicitPodNames.length > 0
      ? explicitPodNames
      : ownerPodName
        ? [ownerPodName]
        : []

    const uniquePodNames = Array.from(new Set(selectedPodNames))

    const primitives = uniquePodNames
      .filter((podName) => snapshot.availablePodNames.includes(podName))
      .map((podName) => {
        const podBaseUrl = ensureTrailingSlash(new URL(`${podName}/`, snapshot.baseUrl).toString())
        const filesPath = path.join(snapshot.dataRoot, podName)
        const candidateProjection = snapshot.projectionRoot
          ? path.join(snapshot.projectionRoot, 'pods', podName, 'structured')
          : undefined

        return {
          podName,
          podBaseUrl,
          filesPath,
          structuredProjectionPath: candidateProjection && fs.existsSync(candidateProjection)
            ? candidateProjection
            : undefined,
        }
      })

    return { snapshot, primitives }
  }
}
