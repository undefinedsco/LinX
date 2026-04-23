import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

function resolvePackageBin(packageName: string, relativeBinPath: string): string | null {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    const packageDir = dirname(packageJsonPath)
    const candidate = join(packageDir, relativeBinPath)
    return existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}

export function resolveCodexAcpCommand(): string {
  return resolvePackageBin('@zed-industries/codex-acp', 'bin/codex-acp.js') ?? 'codex-acp'
}

