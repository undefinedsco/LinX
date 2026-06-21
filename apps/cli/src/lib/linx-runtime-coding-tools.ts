import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type BashOperations,
  createCodingTools,
  createLocalBashOperations,
} from '@earendil-works/pi-coding-agent'

export const DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS = 15

function resolvePackageRoot(): string {
  return fileURLToPath(new URL('../..', import.meta.url))
}

function resolveLinxToolBinDirs(packageRoot = resolvePackageRoot()): string[] {
  const dirs: string[] = []
  let current = packageRoot
  while (true) {
    const binDir = join(current, 'node_modules', '.bin')
    if (existsSync(binDir)) {
      dirs.push(binDir)
    }

    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return dirs
}

function withLinxToolPath(env: NodeJS.ProcessEnv | undefined, packageRoot?: string): NodeJS.ProcessEnv {
  const binDirs = resolveLinxToolBinDirs(packageRoot)
  if (binDirs.length === 0) {
    return env ?? process.env
  }

  const nextEnv: NodeJS.ProcessEnv = { ...(env ?? process.env) }
  const pathKey = Object.keys(nextEnv).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  const existingPath = nextEnv[pathKey] ?? ''
  const existingParts = existingPath.split(delimiter).filter(Boolean)
  const existing = new Set(existingParts)
  const prepended = binDirs.filter((dir) => !existing.has(dir))
  nextEnv[pathKey] = [...prepended, ...existingParts].join(delimiter)
  return nextEnv
}

export function createLinxPiCodingTools(cwd: string, options: {
  bashTimeoutSeconds?: number
  bashOperations?: BashOperations
} = {}): Array<{
  name: string
  execute(callId: string, input: Record<string, unknown>): Promise<unknown>
}> {
  const localBashOperations = options.bashOperations ?? createLocalBashOperations()
  const bashTimeoutSeconds = options.bashTimeoutSeconds ?? DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS
  return createCodingTools(cwd, {
    bash: {
      operations: {
        exec(command, workingDirectory, options) {
          return localBashOperations.exec(command, workingDirectory ?? cwd, {
            ...options,
            env: withLinxToolPath(options.env),
            timeout: typeof options.timeout === 'number'
              ? options.timeout
              : bashTimeoutSeconds,
          })
        },
      },
    },
  })
}
