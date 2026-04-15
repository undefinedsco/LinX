import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type {
  AuthorizedWorkspacePodMount,
  AuthorizedWorkspacePrimitive,
  AuthorizedWorkspaceRecord,
  AuthorizedWorkspaceSnapshot,
  CreateAuthorizedWorkspaceInput,
} from './types'

type MaterializeWorkspaceInput = CreateAuthorizedWorkspaceInput & {
  ownerKey: string
}

function sanitizeSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace'
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

function createReadOnlyView(source: string, target: string): void {
  fs.rmSync(target, { recursive: true, force: true })
  ensureDir(path.dirname(target))
  fs.cpSync(source, target, { recursive: true })
  markReadOnly(target)
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

export function materializeAuthorizedWorkspace(options: {
  workspaceRoot: string
  input: MaterializeWorkspaceInput
  snapshot: AuthorizedWorkspaceSnapshot
  primitives: AuthorizedWorkspacePrimitive[]
}): AuthorizedWorkspaceRecord {
  const { workspaceRoot, input, snapshot, primitives } = options
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const ownerSegment = sanitizeSegment(input.ownerKey)
  const labelSegment = sanitizeSegment(input.label ?? ownerSegment)
  const rootPath = path.join(workspaceRoot, ownerSegment, `${labelSegment}-${id.slice(0, 8)}`)

  ensureDir(rootPath)

  const mounts: AuthorizedWorkspacePodMount[] = []

  const singlePodMode = primitives.length === 1

  for (const primitive of primitives) {
    const podRoot = singlePodMode ? rootPath : path.join(rootPath, 'pods', primitive.podName)
    const filesTarget = path.join(podRoot, 'files')
    createWritableMountLink(primitive.filesPath, filesTarget)

    const mount: AuthorizedWorkspacePodMount = {
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
      writeFile(
        path.join(structuredFallbackRoot, 'README.md'),
        [
          '# Structured projection unavailable',
          '',
          'xpod did not expose a structured projection artifact for this pod.',
          'Linx should still treat this directory as a reserved read-only area.',
          '',
        ].join('\n'),
      )
      writeFile(
        path.join(queryFallbackRoot, 'README.md'),
        [
          '# Query helpers unavailable',
          '',
          'No structured query helper files were exported for this Pod.',
          '',
        ].join('\n'),
      )
      markReadOnly(structuredFallbackRoot)
      markReadOnly(queryFallbackRoot)
    }

    mounts.push(mount)
  }

  writeFile(
    path.join(rootPath, 'README.md'),
    [
      '# Linx Mounted Pod',
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

  const record: AuthorizedWorkspaceRecord = {
    id,
    ownerKey: input.ownerKey,
    ownerWebId: input.ownerWebId,
    label: input.label,
    xpodBaseUrl: snapshot.baseUrl,
    rootPath,
    finderVisible: true,
    status: 'ready',
    podBaseUrls: mounts.map((item) => item.podBaseUrl),
    podNames: mounts.map((item) => item.podName),
    mounts,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  }

  writeFile(path.join(rootPath, 'workspace.json'), `${JSON.stringify(record, null, 2)}\n`)
  writeFile(path.join(rootPath, 'mount.json'), `${JSON.stringify({ mountId: record.id, mountPath: record.rootPath, podNames: record.podNames }, null, 2)}\n`)
  return record
}
