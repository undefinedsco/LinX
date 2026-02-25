/**
 * xpod Module - Manages the Solid Pod server
 *
 * xpod 新架构:
 * - Gateway + Supervisor 模式
 * - 主端口 (--port) 是 Gateway 入口
 * - CSS 和 API 端口内部自动分配
 * - 支持 --mode (local/cloud) 或 --config 指定配置
 */
import * as fs from 'fs'
import * as path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { getWebServerModule } from './web-server'

const XPOD_PACKAGE_CANDIDATES = ['@undefineds.co/xpod', 'xpod']

export interface XpodStatus {
  running: boolean
  port?: number
  baseUrl?: string
  publicUrl?: string
  pid?: number
}

interface XpodRuntime {
  source: string
  cwd: string
  entry: string
}

// Parse .env file to get config
function parseEnvFile(envPath: string): Record<string, string> {
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

function getPackageBinEntry(packageDir: string, pkg: any): string | null {
  const binField = pkg?.bin
  if (!binField) return null

  if (typeof binField === 'string') {
    const resolved = path.join(packageDir, binField)
    return fs.existsSync(resolved) ? resolved : null
  }

  if (typeof binField === 'object') {
    const named = binField.xpod
    if (typeof named === 'string') {
      const resolved = path.join(packageDir, named)
      if (fs.existsSync(resolved)) return resolved
    }

    for (const value of Object.values(binField)) {
      if (typeof value !== 'string') continue
      const resolved = path.join(packageDir, value)
      if (fs.existsSync(resolved)) return resolved
    }
  }

  return null
}

export class XpodModule {
  private process: ChildProcess | null = null
  private ready: boolean = false

  /**
   * Check Node.js version
   */
  private checkNodeVersion(): void {
    const version = process.version
    const majorVersion = parseInt(version.slice(1).split('.')[0], 10)

    if (majorVersion < 20) {
      throw new Error(
        `Node.js version mismatch. xpod requires Node.js 20.x or higher, but current version is ${version}.\n` +
        `Please install Node.js 20.x or higher using: nvm install 22 && nvm use 22`,
      )
    }
  }

  /**
   * Resolve runtime from installed npm package first.
   */
  private resolveFromNpmPackage(): XpodRuntime | null {
    for (const packageName of XPOD_PACKAGE_CANDIDATES) {
      try {
        const packageJsonPath = require.resolve(`${packageName}/package.json`)
        const packageDir = path.dirname(packageJsonPath)
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

        const binEntry = getPackageBinEntry(packageDir, pkg)
        if (binEntry) {
          return {
            source: `npm:${packageName}`,
            cwd: packageDir,
            entry: binEntry,
          }
        }

        const mainEntry = path.join(packageDir, 'dist', 'main.js')
        if (fs.existsSync(mainEntry)) {
          return {
            source: `npm:${packageName}`,
            cwd: packageDir,
            entry: mainEntry,
          }
        }
      } catch {
        // Continue searching next candidate.
      }
    }

    return null
  }

  /**
   * Legacy fallback for local development and packaged desktop resources.
   */
  private resolveLegacyRuntime(): XpodRuntime | null {
    const devXpod = path.join(__dirname, '..', '..', '..', '..', '..', 'xpod')
    const siblingXpod = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'xpod')
    const vendorXpod = path.join(__dirname, '..', '..', '..', '..', '..', 'vendor', 'xpod')

    const legacyCandidates = [devXpod, siblingXpod, vendorXpod]
    for (const candidate of legacyCandidates) {
      const distMain = path.join(candidate, 'dist', 'main.js')
      if (fs.existsSync(distMain)) {
        return {
          source: `legacy:${candidate}`,
          cwd: fs.realpathSync(candidate),
          entry: distMain,
        }
      }
    }

    const resourcesPath = (process as any).resourcesPath
    if (resourcesPath) {
      const packagedXpod = path.join(resourcesPath, 'xpod')
      const distMain = path.join(packagedXpod, 'dist', 'main.js')
      if (fs.existsSync(distMain)) {
        return {
          source: 'packaged-resource',
          cwd: packagedXpod,
          entry: distMain,
        }
      }
    }

    return null
  }

  private resolveRuntime(): XpodRuntime {
    const npmRuntime = this.resolveFromNpmPackage()
    if (npmRuntime) return npmRuntime

    const legacyRuntime = this.resolveLegacyRuntime()
    if (legacyRuntime) return legacyRuntime

    throw new Error(
      'xpod runtime not found. Please install @undefineds.co/xpod (or xpod), or provide a local xpod checkout.',
    )
  }

  /**
   * Start xpod server
   */
  async start(): Promise<void> {
    if (this.process) {
      console.log('[Xpod] Already running')
      return
    }

    this.checkNodeVersion()

    const envPath = getWebServerModule().getEnvPath()

    if (!fs.existsSync(envPath)) {
      throw new Error(`Env file not found: ${envPath}. Please run setup first.`)
    }

    const env = parseEnvFile(envPath)
    const port = parseInt(env.CSS_PORT || '5737', 10)
    const dataDir = env.CSS_ROOT_FILE_PATH || path.join(process.env.HOME || '', 'Library', 'Application Support', 'LinX', 'pod')

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
      console.log('[Xpod] Created data directory:', dataDir)
    }

    const runtime = this.resolveRuntime()
    console.log('[Xpod] Runtime source:', runtime.source)
    console.log('[Xpod] Runtime cwd:', runtime.cwd)
    console.log('[Xpod] Runtime entry:', runtime.entry)
    console.log('[Xpod] Data dir:', dataDir)
    console.log('[Xpod] Gateway port:', port)
    console.log('[Xpod] Using env file:', envPath)

    const args = [
      runtime.entry,
      '--mode', 'local',
      '--port', port.toString(),
      '--env', envPath,
    ]

    const nodePath = process.execPath
    console.log('[Xpod] Using Node.js:', nodePath, '(version:', process.version + ')')

    this.process = spawn(nodePath, args, {
      cwd: runtime.cwd,
      env: {
        ...process.env,
        CSS_PORT: port.toString(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.process.stdout?.on('data', (data) => {
      console.log('[Xpod]', data.toString().trim())
    })

    this.process.stderr?.on('data', (data) => {
      console.error('[Xpod]', data.toString().trim())
    })

    this.process.on('exit', (code) => {
      console.log('[Xpod] Process exited with code:', code)
      this.process = null
      this.ready = false
    })

    this.process.on('error', (error) => {
      console.error('[Xpod] Process error:', error)
      this.process = null
      this.ready = false
    })

    await this.waitForReady(port)
    this.ready = true
    console.log('[Xpod] Server is ready')
  }

  /**
   * Stop xpod server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return
    }

    return new Promise((resolve) => {
      this.process!.on('exit', () => {
        this.process = null
        this.ready = false
        resolve()
      })

      this.process!.kill('SIGTERM')

      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL')
        }
      }, 5000)
    })
  }

  /**
   * Restart xpod server
   */
  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  /**
   * Get current status
   */
  getStatus(): XpodStatus {
    const envPath = getWebServerModule().getEnvPath()
    const env = parseEnvFile(envPath)
    const port = parseInt(env.CSS_PORT || '5737', 10)
    const baseUrl = env.CSS_BASE_URL || `http://localhost:${port}`

    let publicUrl: string | undefined
    if (baseUrl.startsWith('https://') && !baseUrl.includes('localhost')) {
      publicUrl = baseUrl
    }

    if (!this.process || !this.ready) {
      return { running: false, port, baseUrl, publicUrl }
    }

    return {
      running: true,
      port,
      baseUrl,
      publicUrl,
      pid: this.process.pid,
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    const envPath = getWebServerModule().getEnvPath()
    const env = parseEnvFile(envPath)
    const port = parseInt(env.CSS_PORT || '5737', 10)

    try {
      const response = await fetch(`http://localhost:${port}/.well-known/solid`, {
        signal: AbortSignal.timeout(3000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Wait for xpod to be ready
   */
  private async waitForReady(port: number, maxRetries = 60): Promise<void> {
    const gatewayUrl = `http://localhost:${port}/_gateway/status`
    const rootUrl = `http://localhost:${port}/`

    for (let i = 0; i < maxRetries; i++) {
      try {
        const gatewayResponse = await fetch(gatewayUrl, {
          signal: AbortSignal.timeout(2000),
        })
        if (gatewayResponse.ok) {
          const status = await gatewayResponse.json() as Array<{ name: string; status: string }>
          const cssStatus = status.find((s) => s.name === 'css')
          if (cssStatus?.status === 'running') {
            return
          }
        }
      } catch {
        try {
          const rootResponse = await fetch(rootUrl, {
            signal: AbortSignal.timeout(2000),
            method: 'HEAD',
          })
          if (rootResponse.ok) {
            return
          }
        } catch {
          // Continue retrying.
        }
      }
      await new Promise((r) => setTimeout(r, 1000))
    }

    throw new Error('xpod failed to start within timeout')
  }
}

// Singleton
let instance: XpodModule | null = null

export function getXpodModule(): XpodModule {
  if (!instance) {
    instance = new XpodModule()
  }
  return instance
}
