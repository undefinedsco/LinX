import * as fs from 'fs'
import * as path from 'path'
import { loadLocalClientCredentials, type LocalClientCredentials } from '../local-client-credentials'
import { ensureTrailingSlash } from './source-common'

export interface RemoteSolidSessionHandle {
  fetch: typeof fetch
  logout(): Promise<void>
}

export interface RemoteSolidRuntime {
  loadClientCredentials(): LocalClientCredentials | null
  login(clientId: string, clientSecret: string, oidcIssuer: string): Promise<RemoteSolidSessionHandle>
  listContainer(resourceUrl: string, authFetch: typeof fetch): Promise<string[]>
  readFile(resourceUrl: string, authFetch: typeof fetch): Promise<Uint8Array>
  writeFile(resourceUrl: string, data: Uint8Array, authFetch: typeof fetch): Promise<void>
  createContainer(resourceUrl: string, authFetch: typeof fetch): Promise<void>
  deleteFile(resourceUrl: string, authFetch: typeof fetch): Promise<void>
  deleteContainer(resourceUrl: string, authFetch: typeof fetch): Promise<void>
}

export interface EnsureRemoteSolidMirrorInput {
  podBaseUrl: string
  podName: string
  filesPath: string
}

export interface ActivateRemoteSolidMirrorInput extends EnsureRemoteSolidMirrorInput {}

export interface RemoteSolidPodMirrorManager {
  ensureMirror(input: EnsureRemoteSolidMirrorInput): Promise<{ filesPath: string }>
  activateMirror(input: ActivateRemoteSolidMirrorInput): Promise<void>
  releaseMirror(input: { podName: string }): Promise<void>
}

interface RemoteSolidPodActivation {
  watcher: fs.FSWatcher
  knownPaths: Map<string, 'file' | 'dir'>
  debounceTimers: Map<string, NodeJS.Timeout>
  queue: Promise<void>
  rootPath: string
  podBaseUrl: string
}

function ensureDir(target: string): void {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }
}

function clearDir(target: string): void {
  fs.rmSync(target, { recursive: true, force: true })
  ensureDir(target)
}

function relativeRemotePath(podBaseUrl: string, resourceUrl: string): string {
  const base = new URL(ensureTrailingSlash(podBaseUrl))
  const target = new URL(resourceUrl)
  const baseSegments = base.pathname.split('/').filter(Boolean)
  const targetSegments = target.pathname.split('/').filter(Boolean)
  const relativeSegments = targetSegments.slice(baseSegments.length)
  return relativeSegments.map((segment) => decodeURIComponent(segment)).join('/')
}

function toRemoteResourceUrl(podBaseUrl: string, relativePath: string, kind: 'file' | 'dir'): string {
  const normalized = relativePath
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  const suffix = kind === 'dir' ? `${normalized}/` : normalized
  return new URL(suffix, ensureTrailingSlash(podBaseUrl)).toString()
}

function classifyPath(target: string): 'file' | 'dir' | null {
  if (!fs.existsSync(target)) {
    return null
  }
  const stat = fs.statSync(target)
  if (stat.isDirectory()) return 'dir'
  if (stat.isFile()) return 'file'
  return null
}

function scanKnownPaths(rootPath: string): Map<string, 'file' | 'dir'> {
  const known = new Map<string, 'file' | 'dir'>()

  function visit(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      const relative = path.relative(rootPath, absolute)
      if (entry.isDirectory()) {
        known.set(relative, 'dir')
        visit(absolute)
      } else if (entry.isFile()) {
        known.set(relative, 'file')
      }
    }
  }

  if (fs.existsSync(rootPath)) {
    visit(rootPath)
  }

  return known
}

function removeKnownPath(knownPaths: Map<string, 'file' | 'dir'>, relativePath: string): void {
  for (const key of Array.from(knownPaths.keys())) {
    if (key === relativePath || key.startsWith(`${relativePath}${path.sep}`)) {
      knownPaths.delete(key)
    }
  }
}

async function buildDefaultRuntime(): Promise<RemoteSolidRuntime> {
  const { Session } = require('@inrupt/solid-client-authn-node') as typeof import('@inrupt/solid-client-authn-node')
  const solidClient = require('@inrupt/solid-client') as typeof import('@inrupt/solid-client')

  return {
    loadClientCredentials: () => loadLocalClientCredentials(),
    async login(clientId: string, clientSecret: string, oidcIssuer: string) {
      const session = new Session()
      await session.login({
        clientId,
        clientSecret,
        oidcIssuer,
        tokenType: 'Bearer',
      })
      if (!session.info.isLoggedIn) {
        throw new Error('Failed to authenticate with remote Solid Pod')
      }
      return {
        fetch: session.fetch,
        logout: () => session.logout(),
      }
    },
    async listContainer(resourceUrl, authFetch) {
      const dataset = await solidClient.getSolidDataset(resourceUrl, { fetch: authFetch })
      return solidClient.getContainedResourceUrlAll(dataset)
    },
    async readFile(resourceUrl, authFetch) {
      const file = await solidClient.getFile(resourceUrl, { fetch: authFetch })
      return new Uint8Array(await file.arrayBuffer())
    },
    async writeFile(resourceUrl, data, authFetch) {
      const blob = new Blob([data], { type: 'application/octet-stream' })
      await solidClient.overwriteFile(resourceUrl, blob, { fetch: authFetch, contentType: 'application/octet-stream' })
    },
    async createContainer(resourceUrl, authFetch) {
      await solidClient.createContainerAt(resourceUrl, { fetch: authFetch })
    },
    async deleteFile(resourceUrl, authFetch) {
      await solidClient.deleteFile(resourceUrl, { fetch: authFetch })
    },
    async deleteContainer(resourceUrl, authFetch) {
      await solidClient.deleteContainer(resourceUrl, { fetch: authFetch })
    },
  }
}

export class DefaultRemoteSolidPodMirrorManager implements RemoteSolidPodMirrorManager {
  private runtimePromise: Promise<RemoteSolidRuntime> | null = null
  private sessionPromise: Promise<RemoteSolidSessionHandle> | null = null
  private readonly activations = new Map<string, RemoteSolidPodActivation>()

  public constructor(private readonly runtimeFactory: () => Promise<RemoteSolidRuntime> = buildDefaultRuntime) {}

  public async ensureMirror(input: EnsureRemoteSolidMirrorInput): Promise<{ filesPath: string }> {
    clearDir(input.filesPath)
    await this.hydrateContainer(input.podBaseUrl, input.filesPath)
    return { filesPath: input.filesPath }
  }

  public async activateMirror(input: ActivateRemoteSolidMirrorInput): Promise<void> {
    const existing = this.activations.get(input.podName)
    if (existing && existing.rootPath === input.filesPath && existing.podBaseUrl === input.podBaseUrl) {
      return
    }
    if (existing) {
      await this.releaseMirror({ podName: input.podName })
    }

    ensureDir(input.filesPath)
    const activation: RemoteSolidPodActivation = {
      watcher: fs.watch(input.filesPath, { recursive: true }, (_eventType, filename) => {
        const relativePath = typeof filename === 'string' ? filename : ''
        if (!relativePath) {
          return
        }
        this.scheduleSync(input.podName, relativePath)
      }),
      knownPaths: scanKnownPaths(input.filesPath),
      debounceTimers: new Map(),
      queue: Promise.resolve(),
      rootPath: input.filesPath,
      podBaseUrl: input.podBaseUrl,
    }
    this.activations.set(input.podName, activation)
  }

  public async releaseMirror(input: { podName: string }): Promise<void> {
    const activation = this.activations.get(input.podName)
    if (!activation) {
      return
    }
    activation.watcher.close()
    for (const timer of activation.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.activations.delete(input.podName)
  }

  private scheduleSync(podName: string, relativePath: string): void {
    const activation = this.activations.get(podName)
    if (!activation) {
      return
    }

    const existingTimer = activation.debounceTimers.get(relativePath)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      activation.debounceTimers.delete(relativePath)
      activation.queue = activation.queue.then(() => this.syncPath(podName, relativePath)).catch((error) => {
        console.warn('[RemoteSolidPodMirror] Failed to sync path change:', error)
      })
    }, 120)

    activation.debounceTimers.set(relativePath, timer)
  }

  private async syncPath(podName: string, relativePath: string): Promise<void> {
    const activation = this.activations.get(podName)
    if (!activation) {
      return
    }

    const runtime = await this.getRuntime()
    const session = await this.getSession(runtime)
    const absolutePath = path.join(activation.rootPath, relativePath)
    const nextKind = classifyPath(absolutePath)
    const prevKind = activation.knownPaths.get(relativePath)

    if (!nextKind && !prevKind) {
      return
    }

    if (!nextKind && prevKind) {
      await this.deleteRemotePath(runtime, session.fetch, activation.podBaseUrl, relativePath, prevKind)
      removeKnownPath(activation.knownPaths, relativePath)
      return
    }

    if (!nextKind) {
      return
    }

    if (prevKind && prevKind !== nextKind) {
      await this.deleteRemotePath(runtime, session.fetch, activation.podBaseUrl, relativePath, prevKind)
      removeKnownPath(activation.knownPaths, relativePath)
    }

    if (nextKind === 'dir') {
      await this.ensureRemoteDirectory(runtime, session.fetch, activation.podBaseUrl, relativePath)
      activation.knownPaths.set(relativePath, 'dir')
      return
    }

    await this.ensureRemoteDirectory(runtime, session.fetch, activation.podBaseUrl, path.dirname(relativePath))
    const data = fs.readFileSync(absolutePath)
    await runtime.writeFile(toRemoteResourceUrl(activation.podBaseUrl, relativePath, 'file'), data, session.fetch)
    activation.knownPaths.set(relativePath, 'file')
  }

  private async deleteRemotePath(
    runtime: RemoteSolidRuntime,
    authFetch: typeof fetch,
    podBaseUrl: string,
    relativePath: string,
    kind: 'file' | 'dir',
  ): Promise<void> {
    if (kind === 'file') {
      await runtime.deleteFile(toRemoteResourceUrl(podBaseUrl, relativePath, 'file'), authFetch)
      return
    }

    const remoteUrl = toRemoteResourceUrl(podBaseUrl, relativePath, 'dir')
    const children = await runtime.listContainer(remoteUrl, authFetch).catch(() => [])
    for (const childUrl of children) {
      const childRelativePath = relativeRemotePath(podBaseUrl, childUrl)
      if (childUrl.endsWith('/')) {
        await this.deleteRemotePath(runtime, authFetch, podBaseUrl, childRelativePath, 'dir')
      } else {
        await this.deleteRemotePath(runtime, authFetch, podBaseUrl, childRelativePath, 'file')
      }
    }
    await runtime.deleteContainer(remoteUrl, authFetch)
  }

  private async ensureRemoteDirectory(
    runtime: RemoteSolidRuntime,
    authFetch: typeof fetch,
    podBaseUrl: string,
    relativeDirPath: string,
  ): Promise<void> {
    const segments = relativeDirPath.split(path.sep).filter(Boolean)
    let current = ''
    for (const segment of segments) {
      current = current ? path.join(current, segment) : segment
      const url = toRemoteResourceUrl(podBaseUrl, current, 'dir')
      await runtime.createContainer(url, authFetch).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        if (!/already exists|409|exists/i.test(message)) {
          throw error
        }
      })
    }
  }

  private async hydrateContainer(resourceUrl: string, localDir: string): Promise<void> {
    ensureDir(localDir)
    const runtime = await this.getRuntime()
    const session = await this.getSession(runtime)
    const contained = await runtime.listContainer(resourceUrl, session.fetch)

    for (const childUrl of contained) {
      const childRelativePath = relativeRemotePath(resourceUrl, childUrl)
      const childName = childRelativePath.split('/').filter(Boolean)[0]
      if (!childName) {
        continue
      }
      const localPath = path.join(localDir, childName)
      if (childUrl.endsWith('/')) {
        await this.hydrateContainer(childUrl, localPath)
        continue
      }
      ensureDir(path.dirname(localPath))
      const bytes = await runtime.readFile(childUrl, session.fetch)
      fs.writeFileSync(localPath, Buffer.from(bytes))
    }
  }

  private async getRuntime(): Promise<RemoteSolidRuntime> {
    if (!this.runtimePromise) {
      this.runtimePromise = this.runtimeFactory()
    }
    return this.runtimePromise
  }

  private async getSession(runtime: RemoteSolidRuntime): Promise<RemoteSolidSessionHandle> {
    if (!this.sessionPromise) {
      const credentials = runtime.loadClientCredentials()
      if (!credentials) {
        throw new Error('Remote Pod mount requires local client credentials in ~/.linx')
      }
      this.sessionPromise = runtime.login(credentials.clientId, credentials.clientSecret, credentials.url)
    }
    return this.sessionPromise
  }
}
