import * as fs from 'fs'
import * as path from 'path'
import { getWebServerModule } from '../web-server'
import { getXpodModule, type XpodStatus } from '../xpod'
import type { PodMountPrimitive, PodMountSnapshot, PodMountSource } from './types'
import { ensureTrailingSlash, listPodDirectories, podNameFromBaseUrl, podNameFromWebId, readEnvFile, resolveStructuredProjectionPath } from './source-common'

export interface LocalXpodMountSourceOptions {
  envPath?: string
  statusProvider?: () => XpodStatus
}

export class LocalXpodMountSource implements PodMountSource {
  private readonly envPath: string
  private readonly statusProvider: () => XpodStatus

  public constructor(options: LocalXpodMountSourceOptions = {}) {
    this.envPath = options.envPath ?? getWebServerModule().getEnvPath()
    this.statusProvider = options.statusProvider ?? (() => getXpodModule().getStatus())
  }

  public getSnapshot(): PodMountSnapshot {
    const env = readEnvFile(this.envPath)
    const status = this.statusProvider()
    const baseUrl = ensureTrailingSlash(status.baseUrl || env.CSS_BASE_URL || 'http://localhost:5737/')
    const dataRoot = env.CSS_ROOT_FILE_PATH || path.join(process.env.HOME || '', 'Library', 'Application Support', 'LinX', 'pod')
    const projectionRoot = path.join(dataRoot, '.xpod-ai')
    const availablePodNames = listPodDirectories(dataRoot)

    return {
      source: 'local-embedded-xpod',
      running: status.running,
      baseUrl,
      dataRoot,
      projectionRoot: fs.existsSync(projectionRoot) ? projectionRoot : undefined,
      availablePodNames,
    }
  }

  public resolveAuthorizedPrimitives(input: { ownerWebId?: string; podBaseUrls?: string[] }): {
    snapshot: PodMountSnapshot
    primitives: PodMountPrimitive[]
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
      .map((podName) => ({
        podName,
        podBaseUrl: ensureTrailingSlash(new URL(`${podName}/`, snapshot.baseUrl).toString()),
        filesPath: path.join(snapshot.dataRoot, podName),
        structuredProjectionPath: resolveStructuredProjectionPath(snapshot.projectionRoot, podName),
      }))

    return { snapshot, primitives }
  }
}
