import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type {
  PodMountBinding,
  PodMountRecord,
  PodMountSource,
  CreatePodMountInput,
} from './types'

type MaterializeMountInput = CreatePodMountInput & {
  ownerKey: string
}

function sanitizeSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'mount'
}

function ensureDir(target: string): void {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }
}

function writeFile(target: string, content: string): void {
  ensureDir(path.dirname(target))
  fs.writeFileSync(target, content, 'utf-8')
}

function createWritableMountLink(source: string, target: string): void {
  fs.rmSync(target, { recursive: true, force: true })
  ensureDir(path.dirname(target))
  try {
    fs.symlinkSync(source, target, 'dir')
  } catch (error) {
    throw new Error(`Writable pod mount requires symlink support for ${source} -> ${target}: ${String(error)}`)
  }
}

function markReadOnly(target: string): void {
  const stat = fs.statSync(target)
  if (stat.isDirectory()) {
    fs.chmodSync(target, 0o555)
    for (const entry of fs.readdirSync(target)) {
      markReadOnly(path.join(target, entry))
    }
    return
  }
  fs.chmodSync(target, 0o444)
}

function createReadOnlyView(source: string, target: string): void {
  fs.rmSync(target, { recursive: true, force: true })
  ensureDir(path.dirname(target))
  fs.cpSync(source, target, { recursive: true })
  markReadOnly(target)
}

export function materializePodMount(options: {
  mountRoot: string
  input: MaterializeMountInput
  snapshot: ReturnType<PodMountSource['getSnapshot']>
  primitives: ReturnType<PodMountSource['resolveAuthorizedPrimitives']>['primitives']
}): PodMountRecord {
  const { mountRoot, input, snapshot, primitives } = options
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const ownerSegment = sanitizeSegment(input.ownerKey)
  const labelSegment = sanitizeSegment(input.label ?? ownerSegment)
  const rootPath = path.join(mountRoot, ownerSegment, `${labelSegment}-${id.slice(0, 8)}`)

  ensureDir(rootPath)

  const bindings: PodMountBinding[] = []
  const singlePodMode = primitives.length === 1

  for (const primitive of primitives) {
    const podRoot = singlePodMode ? rootPath : path.join(rootPath, 'pods', primitive.podName)
    const filesTarget = path.join(podRoot, 'files')
    createWritableMountLink(primitive.filesPath, filesTarget)

    const binding: PodMountBinding = {
      podName: primitive.podName,
      podBaseUrl: primitive.podBaseUrl,
      filesPath: primitive.filesPath,
      targetPath: filesTarget,
      structuredProjectionPath: primitive.structuredProjectionPath,
    }

    if (primitive.structuredProjectionPath) {
      createReadOnlyView(primitive.structuredProjectionPath, path.join(podRoot, 'structured'))
      const querySource = path.join(primitive.structuredProjectionPath, 'queries')
      if (fs.existsSync(querySource)) {
        createReadOnlyView(querySource, path.join(podRoot, 'queries'))
      }
    } else {
      const structuredFallbackRoot = path.join(podRoot, 'structured')
      const queryFallbackRoot = path.join(podRoot, 'queries')
      writeFile(path.join(structuredFallbackRoot, 'README.md'), '# Structured projection unavailable\n')
      writeFile(path.join(queryFallbackRoot, 'README.md'), '# Query helpers unavailable\n')
      markReadOnly(structuredFallbackRoot)
      markReadOnly(queryFallbackRoot)
    }

    bindings.push(binding)
  }

  writeFile(
    path.join(rootPath, 'README.md'),
    [
      '# Linx Pod Mount',
      '',
      'This directory represents a mounted Pod view owned by Linx.',
      'It is intentionally **not** raw xpod storage.',
      '',
      singlePodMode
        ? 'This root is a single-Pod mount for the current authorized identity.'
        : 'This root currently contains multiple pod subdirectories.',
      '',
    ].join('\n'),
  )

  const record: PodMountRecord = {
    id,
    ownerKey: input.ownerKey,
    ownerWebId: input.ownerWebId,
    label: input.label,
    source: snapshot.source,
    xpodBaseUrl: snapshot.baseUrl,
    rootPath,
    finderVisible: true,
    status: 'ready',
    podBaseUrls: bindings.map((item) => item.podBaseUrl),
    podNames: bindings.map((item) => item.podName),
    mounts: bindings,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  }

  writeFile(path.join(rootPath, 'mount.json'), `${JSON.stringify({ mountId: record.id, mountPath: record.rootPath, podNames: record.podNames, source: record.source }, null, 2)}\n`)
  return record
}
