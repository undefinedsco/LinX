import * as fs from 'fs'
import { homedir } from 'os'
import * as path from 'path'
import type { LocalAccountSession } from '../local-account-session'
import { loadLocalAccountSession } from '../local-account-session'
import type {
  PodMountPrimitive,
  PodMountRecord,
  PodMountSnapshot,
  PodMountSource,
  ResolveAuthorizedPrimitivesInput,
  ResolvedAuthorizedPrimitives,
} from './types'
import { DefaultRemoteSolidPodMirrorManager, type RemoteSolidPodMirrorManager } from './remote-solid-mirror'
import { ensureTrailingSlash, podBaseUrlFromWebId, podNameFromBaseUrl, podNameFromWebId, pathExists } from './source-common'

export interface RemoteSolidPodMountSourceOptions {
  accountProvider?: () => LocalAccountSession | null
  mirrorRoot?: string
  mirrorManager?: RemoteSolidPodMirrorManager
}

function defaultMirrorRoot(): string {
  return path.join(homedir(), 'Library', 'Application Support', 'LinX', 'remote-pod-mirror')
}

export class RemoteSolidPodMountSource implements PodMountSource {
  private readonly accountProvider: () => LocalAccountSession | null
  private readonly mirrorRoot: string
  private readonly mirrorManager: RemoteSolidPodMirrorManager

  public constructor(options: RemoteSolidPodMountSourceOptions = {}) {
    this.accountProvider = options.accountProvider ?? loadLocalAccountSession
    this.mirrorRoot = options.mirrorRoot ?? defaultMirrorRoot()
    this.mirrorManager = options.mirrorManager ?? new DefaultRemoteSolidPodMirrorManager()
  }

  public getSnapshot(): PodMountSnapshot {
    const session = this.accountProvider()
    const ownerPodName = session?.podUrl
      ? podNameFromBaseUrl(session.podUrl)
      : session?.ownerWebId
        ? podNameFromWebId(session.ownerWebId)
        : undefined
    const baseUrl = ensureTrailingSlash(session?.podUrl || session?.url || '')

    return {
      source: 'remote-solid-pod',
      running: Boolean(session?.ownerKey && (session?.podUrl || session?.ownerWebId)),
      baseUrl,
      dataRoot: this.mirrorRoot,
      availablePodNames: ownerPodName ? [ownerPodName] : [],
    }
  }

  public resolveAuthorizedPrimitives(input: ResolveAuthorizedPrimitivesInput): ResolvedAuthorizedPrimitives {
    const snapshot = this.getSnapshot()
    const session = this.accountProvider()
    const selection = this.resolveSelection(input, session)
    const primitives = selection.selectedPodNames.map((podName) => {
      const podBaseUrl = selection.ownerBaseUrl ?? (snapshot.baseUrl ? ensureTrailingSlash(new URL(`${podName}/`, snapshot.baseUrl).toString()) : '')
      const podRoot = path.join(this.mirrorRoot, 'pods', podName)
      const filesPath = path.join(podRoot, 'files')
      const structuredProjectionPath = path.join(podRoot, 'structured')

      if (!fs.existsSync(filesPath)) {
        throw new Error(`Remote Pod mount mirror not found for ${podName}. Expected ${filesPath}`)
      }

      return {
        podName,
        podBaseUrl,
        filesPath,
        structuredProjectionPath: pathExists(structuredProjectionPath) ? structuredProjectionPath : undefined,
      }
    })

    return { snapshot, primitives }
  }

  public async prepareAuthorizedPrimitives(input: ResolveAuthorizedPrimitivesInput): Promise<ResolvedAuthorizedPrimitives> {
    const snapshot = this.getSnapshot()
    const session = this.accountProvider()
    const selection = this.resolveSelection(input, session)

    const primitives: PodMountPrimitive[] = []
    for (const podName of selection.selectedPodNames) {
      const podBaseUrl = selection.ownerBaseUrl ?? (snapshot.baseUrl ? ensureTrailingSlash(new URL(`${podName}/`, snapshot.baseUrl).toString()) : '')
      const filesPath = path.join(this.mirrorRoot, 'pods', podName, 'files')
      await this.mirrorManager.ensureMirror({ podBaseUrl, podName, filesPath })
      await this.mirrorManager.activateMirror({ podBaseUrl, podName, filesPath })
      primitives.push({ podName, podBaseUrl, filesPath })
    }

    return { snapshot, primitives }
  }

  public async activateMount(record: PodMountRecord): Promise<void> {
    if (record.source !== 'remote-solid-pod') {
      return
    }
    for (const mount of record.mounts) {
      await this.mirrorManager.activateMirror({
        podName: mount.podName,
        podBaseUrl: mount.podBaseUrl,
        filesPath: mount.filesPath,
      })
    }
  }

  public async releaseMount(record: PodMountRecord): Promise<void> {
    if (record.source !== 'remote-solid-pod') {
      return
    }
    for (const mount of record.mounts) {
      await this.mirrorManager.releaseMirror({ podName: mount.podName })
    }
  }

  private resolveSelection(input: ResolveAuthorizedPrimitivesInput, session: LocalAccountSession | null) {
    const explicitPodNames = (input.podBaseUrls ?? [])
      .map((url) => podNameFromBaseUrl(url))
      .filter((value): value is string => Boolean(value))

    const ownerPodName = input.ownerWebId
      ? podNameFromWebId(input.ownerWebId)
      : session?.podUrl
        ? podNameFromBaseUrl(session.podUrl)
        : session?.ownerWebId
          ? podNameFromWebId(session.ownerWebId)
          : undefined

    if (explicitPodNames.length > 0 && !ownerPodName) {
      throw new Error('Explicit pod selection requires an ownerWebId or podUrl for remote mounts')
    }

    if (ownerPodName && explicitPodNames.some((podName) => podName !== ownerPodName)) {
      throw new Error('Explicit pod selection cannot exceed the owner pod in the current MVP')
    }

    const selectedPodNames = Array.from(new Set(explicitPodNames.length > 0
      ? explicitPodNames
      : ownerPodName
        ? [ownerPodName]
        : []))

    const sessionPodUrl = session?.podUrl ? ensureTrailingSlash(session.podUrl) : undefined
    const sessionPodName = sessionPodUrl ? podNameFromBaseUrl(sessionPodUrl) : undefined

    const ownerBaseUrl = sessionPodUrl && (!ownerPodName || sessionPodName === ownerPodName)
      ? sessionPodUrl
      : input.ownerWebId
        ? podBaseUrlFromWebId(input.ownerWebId)
        : undefined

    return {
      selectedPodNames,
      ownerBaseUrl,
    }
  }
}
