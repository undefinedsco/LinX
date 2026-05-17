import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

function codexAcpPlatformPackage(): { packageName: string; binaryName: string } | null {
  const binaryName = process.platform === 'win32' ? 'codex-acp.exe' : 'codex-acp'

  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') return { packageName: '@zed-industries/codex-acp-darwin-arm64', binaryName }
    if (process.arch === 'x64') return { packageName: '@zed-industries/codex-acp-darwin-x64', binaryName }
    return null
  }

  if (process.platform === 'linux') {
    if (process.arch === 'arm64') return { packageName: '@zed-industries/codex-acp-linux-arm64', binaryName }
    if (process.arch === 'x64') return { packageName: '@zed-industries/codex-acp-linux-x64', binaryName }
    return null
  }

  if (process.platform === 'win32') {
    if (process.arch === 'arm64') return { packageName: '@zed-industries/codex-acp-win32-arm64', binaryName }
    if (process.arch === 'x64') return { packageName: '@zed-industries/codex-acp-win32-x64', binaryName }
  }

  return null
}

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
  const platformPackage = codexAcpPlatformPackage()
  if (platformPackage) {
    const nativeBin = resolvePackageBin(platformPackage.packageName, `bin/${platformPackage.binaryName}`)
    if (nativeBin) {
      return nativeBin
    }
  }

  return resolvePackageBin('@zed-industries/codex-acp', 'bin/codex-acp.js') ?? 'codex-acp'
}
