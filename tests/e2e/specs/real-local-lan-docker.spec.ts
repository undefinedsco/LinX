import { expect, test } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { startRealLocalDeviceRuntime } from '../helpers/real-local-cloud-runtime.cjs'

const execFileAsync = promisify(execFile)

test.describe.configure({ mode: 'serial' })

test.describe('Real Local LAN/Docker reachability', () => {
  test.skip(process.env.LINX_SKIP_DOCKER_LAN === '1', 'LINX_SKIP_DOCKER_LAN=1')

  test('uses CSS_BASE_URL as the only LAN entry and is reachable from Docker', async ({ page }) => {
    test.setTimeout(180_000)

    await ensureDockerAvailable()

    const runtime = await startRealLocalDeviceRuntime(page, {
      baseUrl: (port: number) => `http://host.docker.internal:${port}/`,
    })

    try {
      await runtime.start()
      const snapshot = await runtime.getSnapshot()

      expect(snapshot.state).toBe('ready')
      expect(snapshot.mode).toBe('device-only')
      expect(snapshot.baseUrl).toBe(runtime.baseUrl)
      expect(snapshot.publicUrl).toBeNull()
      expect(snapshot.provisionCode).toBeNull()

      const endpoint = new URL('/api/linx/capabilities', runtime.baseUrl).toString()
      const payload = await fetchFromDocker(endpoint)
      const hostEndpoint = new URL('/api/linx/capabilities', snapshot.localUrl ?? `http://localhost:${runtime.port}/`).toString()
      const hostPayload = await fetchFromHost(hostEndpoint)

      expect(payload.contract).toBe('linx-local-onboarding/v1')
      expect(normalizeUrl(payload.baseUrl)).toBe(normalizeUrl(runtime.baseUrl))
      expect(hostPayload.contract).toBe('linx-local-onboarding/v1')
      expect(normalizeUrl(hostPayload.baseUrl)).toBe(normalizeUrl(runtime.baseUrl))
    } finally {
      await runtime.stop()
    }
  })
})

async function ensureDockerAvailable(): Promise<void> {
  try {
    await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 10_000 })
  } catch (error) {
    test.skip(true, `Docker is not available: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function fetchFromDocker(url: string): Promise<any> {
  const script = [
    `const url = ${JSON.stringify(url)};`,
    'const res = await fetch(url, { headers: { Accept: "application/json" } });',
    'const text = await res.text();',
    'if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`);',
    'console.log(text);',
  ].join('\n')

  const { stdout } = await execFileAsync(
    'docker',
    ['run', '--rm', 'xpod:dev', 'node', '--input-type=module', '-e', script],
    {
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    },
  )

  return JSON.parse(stdout)
}

async function fetchFromHost(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${text}`)
  }
  return JSON.parse(text)
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.endsWith('/') ? value : `${value}/`
}
