import { randomInt } from 'node:crypto'
import { once } from 'node:events'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface SeededXpodRuntime {
  baseUrl: string
  email: string
  password: string
  podName: string
  username?: string
  stop: () => Promise<void>
}

const LOCAL_RUNTIME_PORT_MIN = 30_000
const LOCAL_RUNTIME_PORT_RANGE = 20_000
const LOCAL_RUNTIME_PORT_BLOCK = 10
const LOCAL_RUNTIME_START_RETRIES = 6
const HEALTH_CHECK_TIMEOUT_MS = 90_000
const repoRoot = resolveRepoRoot()

function resolveRepoRoot(): string {
  const cwd = path.resolve(process.cwd())
  const normalized = cwd.split(path.sep).join('/')
  if (normalized.endsWith('/tests/e2e')) {
    return path.resolve(cwd, '../..')
  }
  return cwd
}

function pickLocalRuntimePorts(): {
  gatewayPort: number
  cssPort: number
  apiPort: number
  baseUrl: string
} {
  const slotCount = Math.floor(LOCAL_RUNTIME_PORT_RANGE / LOCAL_RUNTIME_PORT_BLOCK)
  const basePort = LOCAL_RUNTIME_PORT_MIN + (randomInt(slotCount) * LOCAL_RUNTIME_PORT_BLOCK)

  return {
    gatewayPort: basePort,
    cssPort: basePort + 1,
    apiPort: basePort + 2,
    baseUrl: `http://localhost:${basePort}/`,
  }
}

function appendChunk(buffer: string, chunk: Buffer | string, maxLength = 12_000): string {
  return `${buffer}${chunk.toString()}`.slice(-maxLength)
}

function isPortConflictError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as {
    code?: string
    message?: string
    cause?: unknown
  }

  if (candidate.code === 'EADDRINUSE') {
    return true
  }

  if (typeof candidate.message === 'string' && candidate.message.includes('EADDRINUSE')) {
    return true
  }

  return isPortConflictError(candidate.cause)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

interface XpodRuntimeCommand {
  command: string
  argsPrefix: string[]
  cwd: string
  configPath: string
}

async function resolveXpodRuntimeCommand(runtimeRoot: string): Promise<XpodRuntimeCommand> {
  const envRoot = process.env.LINX_XPOD_ROOT?.trim()

  if (envRoot) {
    const candidate = path.resolve(envRoot)
    if (
      await fileExists(path.join(candidate, 'package.json'))
      && await fileExists(path.join(candidate, 'src', 'main.ts'))
    ) {
      return {
        command: process.env.LINX_XPOD_BUN_BINARY ?? 'bun',
        argsPrefix: [path.join(candidate, 'src', 'main.ts')],
        cwd: candidate,
        configPath: path.join(candidate, 'config', 'local.json'),
      }
    }

    throw new Error(`LINX_XPOD_ROOT 不是可用的 xpod 源码目录: ${candidate}`)
  }

  const packageRoot = path.resolve(repoRoot, 'node_modules', '@undefineds.co', 'xpod')
  const packageEntry = path.join(packageRoot, 'dist', 'main.js')
  const configPath = path.join(packageRoot, 'config', 'local.json')

  if (
    await fileExists(path.join(packageRoot, 'package.json'))
    && await fileExists(packageEntry)
    && await fileExists(configPath)
  ) {
    return {
      command: process.execPath,
      argsPrefix: [packageEntry],
      cwd: runtimeRoot,
      configPath,
    }
  }

  throw new Error('未找到可用的 @undefineds.co/xpod 安装包。请先安装依赖，或显式设置 `LINX_XPOD_ROOT`。')
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return
  }

  child.kill('SIGTERM')

  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000)),
  ])

  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL')
    await once(child, 'exit').catch(() => undefined)
  }
}

async function waitForHealthy(
  baseUrl: string,
  child: ChildProcess,
  logs: { stdout: string; stderr: string },
): Promise<void> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error([
        `xpod exited early with code ${child.exitCode}`,
        logs.stdout ? `stdout:\n${logs.stdout}` : '',
        logs.stderr ? `stderr:\n${logs.stderr}` : '',
      ].filter(Boolean).join('\n\n'))
    }

    try {
      const response = await fetch(new URL('/service/status', baseUrl), {
        signal: AbortSignal.timeout(1_500),
      })

      if (response.ok) {
        const items = await response.json() as Array<{ name?: string; status?: string }>
        const cssRunning = items.some((item) => item.name === 'css' && item.status === 'running')
        const apiRunning = items.some((item) => item.name === 'api' && item.status === 'running')
        if (cssRunning && apiRunning) {
          return
        }
      }
    } catch {
      // keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  throw new Error([
    `timed out waiting for xpod to become healthy at ${baseUrl}`,
    logs.stdout ? `stdout:\n${logs.stdout}` : '',
    logs.stderr ? `stderr:\n${logs.stderr}` : '',
  ].filter(Boolean).join('\n\n'))
}

export async function startSeededXpodRuntime(): Promise<SeededXpodRuntime> {
  return startTestXpodRuntime({
    email: process.env.XPOD_TEST_SEED_EMAIL || 'test-integration@example.com',
    password: process.env.XPOD_TEST_SEED_PASSWORD || 'TestIntegration123!',
    podName: process.env.XPOD_TEST_POD_NAME || 'test',
    seedAccount: true,
  })
}

export async function startUnseededXpodRuntime(): Promise<SeededXpodRuntime> {
  const suffix = `${Date.now()}${randomInt(10_000)}`.slice(-8)
  const username = `linx${suffix}`

  return startTestXpodRuntime({
    email: `linx-${suffix}@example.com`,
    password: 'TestIntegration123!',
    podName: username,
    username,
    seedAccount: false,
  })
}

async function startTestXpodRuntime(options: {
  email: string
  password: string
  podName: string
  username?: string
  seedAccount: boolean
}): Promise<SeededXpodRuntime> {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'linx-e2e-xpod-'))
  const { email, password, podName, username, seedAccount } = options
  const seedConfigPath = path.join(runtimeRoot, 'seed-accounts.json')
  const xpodCommand = await resolveXpodRuntimeCommand(runtimeRoot)

  if (seedAccount) {
    await writeFile(
      seedConfigPath,
      `${JSON.stringify([
        {
          email,
          password,
          pods: [{ name: podName }],
        },
      ], null, 2)}\n`,
      'utf-8',
    )
  }

  let child: ChildProcess | null = null
  let lastStartError: unknown

  try {
    for (let attempt = 0; attempt < LOCAL_RUNTIME_START_RETRIES; attempt += 1) {
      const ports = pickLocalRuntimePorts()
      const logs = { stdout: '', stderr: '' }

      try {
        child = spawn(
          xpodCommand.command,
          [
            ...xpodCommand.argsPrefix,
            '--config',
            xpodCommand.configPath,
            '--port',
            String(ports.gatewayPort),
            '--host',
            '127.0.0.1',
          ],
          {
            cwd: xpodCommand.cwd,
            env: {
              ...process.env,
              CSS_BASE_URL: ports.baseUrl,
              CSS_ROOT_FILE_PATH: path.join(runtimeRoot, 'pod'),
              CSS_IDENTITY_DB_URL: `sqlite:${path.join(runtimeRoot, 'identity.sqlite')}`,
              CSS_SPARQL_ENDPOINT: `sqlite:${path.join(runtimeRoot, 'quadstore.sqlite')}`,
              CSS_SEED_CONFIG: seedAccount ? seedConfigPath : '',
              CSS_LOGGING_LEVEL: process.env.XPOD_TEST_LOG_LEVEL || 'error',
              XPOD_TEST_TRANSPORT: 'port',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        )

        child.stdout?.on('data', (chunk) => {
          if (process.env.XPOD_TEST_ECHO_LOGS === '1') {
            process.stdout.write(`[xpod:stdout] ${chunk.toString()}`)
          }
          logs.stdout = appendChunk(logs.stdout, chunk)
        })
        child.stderr?.on('data', (chunk) => {
          if (process.env.XPOD_TEST_ECHO_LOGS === '1') {
            process.stderr.write(`[xpod:stderr] ${chunk.toString()}`)
          }
          logs.stderr = appendChunk(logs.stderr, chunk)
        })

        await waitForHealthy(ports.baseUrl, child, logs)

        return {
          baseUrl: ports.baseUrl,
          email,
          password,
          podName,
          username,
          stop: async () => {
            if (child) {
              await stopChild(child).catch(() => undefined)
            }
            await rm(runtimeRoot, { recursive: true, force: true }).catch(() => undefined)
          },
        }
      } catch (error) {
        lastStartError = error
        if (child) {
          await stopChild(child).catch(() => undefined)
          child = null
        }
        if (!isPortConflictError(error) || attempt === LOCAL_RUNTIME_START_RETRIES - 1) {
          throw error
        }
      }
    }

    throw lastStartError instanceof Error ? lastStartError : new Error('Failed to start seeded xpod runtime')
  } catch (error) {
    if (child) {
      await stopChild(child).catch(() => undefined)
    }
    await rm(runtimeRoot, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}
