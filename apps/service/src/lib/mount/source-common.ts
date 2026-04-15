import * as fs from 'fs'
import * as path from 'path'

export function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

export function readEnvFile(envPath: string): Record<string, string> {
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

export function listPodDirectories(dataRoot: string): string[] {
  if (!fs.existsSync(dataRoot)) {
    return []
  }

  return fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
}

export function podNameFromWebId(webId: string): string | undefined {
  try {
    const url = new URL(webId)
    return url.pathname.split('/').filter(Boolean)[0]
  } catch {
    return undefined
  }
}

export function podBaseUrlFromWebId(webId: string): string | undefined {
  try {
    const url = new URL(webId)
    const podName = url.pathname.split('/').filter(Boolean)[0]
    if (!podName) {
      return undefined
    }
    return ensureTrailingSlash(new URL(`${podName}/`, url.origin + '/').toString())
  } catch {
    return undefined
  }
}

export function podNameFromBaseUrl(podBaseUrl: string): string | undefined {
  try {
    const url = new URL(podBaseUrl)
    return url.pathname.split('/').filter(Boolean)[0]
  } catch {
    return undefined
  }
}

export function pathExists(target: string | undefined): target is string {
  if (!target) {
    return false
  }
  return fs.existsSync(target)
}

export function resolveStructuredProjectionPath(projectionRoot: string | undefined, podName: string): string | undefined {
  if (!projectionRoot) {
    return undefined
  }
  const candidate = path.join(projectionRoot, 'pods', podName, 'structured')
  return pathExists(candidate) ? candidate : undefined
}
