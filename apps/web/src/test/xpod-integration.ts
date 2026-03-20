// @vitest-environment node
import dotenv from 'dotenv'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, type SolidAuthSession, type SolidDatabase } from '@undefineds.co/drizzle-solid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const XPOD_RUNTIME_MODULE_URL = pathToFileURL(
  resolve(__dirname, '../../../../node_modules/@undefineds.co/xpod/dist/runtime/index.js'),
).href
dotenv.config({ path: resolve(__dirname, '../../../../.env') })

type AuthType = 'client_credentials' | 'oidc_oauth'
type RequestedMode = 'local' | 'auth' | 'auto'
type RuntimeMode = 'local-seeded-auth' | 'external-auth'

interface StoredConfig {
  url: string
  webId: string
  authType: AuthType
}

interface StoredSecrets {
  clientId: string
  clientSecret: string
}

interface ExternalAuthConfig {
  url: string
  webId: string
  clientId: string
  clientSecret: string
  source: 'env' | 'cli'
}

interface SeedAccountEntry {
  email: string
  password: string
  pods?: Array<{ name: string }>
}

interface LocalSeedConfig {
  seedConfigPath: string
  email: string
  password: string
  podName: string
}

interface AccountPayload {
  controls?: {
    account?: {
      clientCredentials?: string
    }
  }
  webIds?: Record<string, string>
}

export interface XpodIntegrationContext<TSchema extends Record<string, unknown>> {
  mode: RuntimeMode
  db: SolidDatabase<TSchema>
  baseUrl: string
  webId: string
  apiKey?: string
  stop: () => Promise<void>
}

interface XpodIntegrationOptions<TSchema extends Record<string, unknown>> {
  schema: TSchema
  tables: unknown[]
  initialize?: (db: SolidDatabase<TSchema>) => void | Promise<void>
}

const LOCAL_RUNTIME_PORT_MIN = 30_000
const LOCAL_RUNTIME_PORT_RANGE = 20_000
const LOCAL_RUNTIME_PORT_BLOCK = 10
const LOCAL_RUNTIME_START_RETRIES = 6
const LOCAL_RUNTIME_READY_TIMEOUT_MS = 20_000
const LOCAL_RUNTIME_STOP_TIMEOUT_MS = 2_000

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

function getRequestedMode(): RequestedMode {
  const value = process.env.XPOD_TEST_MODE
  if (value === 'auth' || value === 'auto' || value === 'local') {
    return value
  }
  return 'local'
}

function buildApiKey(clientId: string, clientSecret: string): string {
  return `sk-${Buffer.from(`${clientId}:${clientSecret}`, 'utf-8').toString('base64')}`
}

function closeConnectionHeaders(initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders)
  headers.set('Connection', 'close')
  return headers
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

function formatLocalRuntimeStartupError(errorText: string): string {
  if (errorText.includes('EPERM') && errorText.includes('listen')) {
    return `${errorText}\nHint: local xpod integration tests need permission to bind localhost ports. In sandboxed runs this is often blocked by the environment, not by Linx chat code.`
  }

  return errorText
}

async function waitForLocalRuntimeReady(options: {
  child: ChildProcess
  readyPath: string
  errorPath: string
  timeoutMs: number
}): Promise<string> {
  const deadline = Date.now() + options.timeoutMs

  while (Date.now() < deadline) {
    if (existsSync(options.readyPath)) {
      const payload = readJson<{ baseUrl?: string }>(options.readyPath)
      if (payload?.baseUrl) {
        return payload.baseUrl
      }
    }

    if (options.child.exitCode !== null) {
      const errorText = existsSync(options.errorPath)
        ? readFileSync(options.errorPath, 'utf-8').trim()
        : `child exited with code ${options.child.exitCode}`
      throw new Error(`Local xpod runtime failed to start: ${formatLocalRuntimeStartupError(errorText)}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('Timed out waiting for local xpod runtime to become ready')
}

async function stopLocalRuntimeProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return
  }

  child.kill('SIGTERM')

  const deadline = Date.now() + LOCAL_RUNTIME_STOP_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  if (child.exitCode === null) {
    child.kill('SIGKILL')
  }
}

async function startLocalRuntimeProcess(options: {
  runtimeRoot: string
  seedConfigPath: string
  baseUrl: string
  gatewayPort: number
  cssPort: number
  apiPort: number
}): Promise<{ child: ChildProcess; baseUrl: string }> {
  const optionsPath = join(options.runtimeRoot, 'xpod-runtime-options.json')
  const readyPath = join(options.runtimeRoot, 'xpod-runtime-ready.json')
  const errorPath = join(options.runtimeRoot, 'xpod-runtime-error.log')
  const scriptPath = join(options.runtimeRoot, 'xpod-runtime-child.mjs')

  const runtimeOptions = {
    mode: 'local',
    transport: 'port',
    runtimeRoot: options.runtimeRoot,
    baseUrl: options.baseUrl,
    gatewayPort: options.gatewayPort,
    cssPort: options.cssPort,
    apiPort: options.apiPort,
    logLevel: process.env.XPOD_TEST_LOG_LEVEL || 'error',
    shorthand: {
      seedConfig: options.seedConfigPath,
    },
  }

  const script = `
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { startXpodRuntime } from ${JSON.stringify(XPOD_RUNTIME_MODULE_URL)}

const options = JSON.parse(await readFile(process.env.XPOD_RUNTIME_OPTIONS_PATH, 'utf-8'))
const errorPath = process.env.XPOD_RUNTIME_ERROR_PATH

async function recordFailure(error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  if (errorPath) {
    await appendFile(errorPath, message + '\\n', 'utf-8').catch(() => undefined)
  }
  console.error(message)
}

process.on('uncaughtException', (error) => {
  void recordFailure(error).finally(() => {
    process.exit(1)
  })
})

process.on('unhandledRejection', (reason) => {
  void recordFailure(reason).finally(() => {
    process.exit(1)
  })
})

try {
  const runtime = await startXpodRuntime(options)
  await writeFile(
    process.env.XPOD_RUNTIME_READY_PATH,
    JSON.stringify({ baseUrl: runtime.baseUrl }) + '\\n',
    'utf-8',
  )
} catch (error) {
  await recordFailure(error)
  process.exit(1)
}
`

  await writeFile(optionsPath, `${JSON.stringify(runtimeOptions, null, 2)}\n`, 'utf-8')
  await writeFile(scriptPath, script, 'utf-8')

  const child = spawn(process.execPath, [scriptPath], {
    cwd: options.runtimeRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      XPOD_RUNTIME_OPTIONS_PATH: optionsPath,
      XPOD_RUNTIME_READY_PATH: readyPath,
      XPOD_RUNTIME_ERROR_PATH: errorPath,
    },
  })
  child.stderr?.pipe(createWriteStream(errorPath, { flags: 'a' }))

  const baseUrl = await waitForLocalRuntimeReady({
    child,
    readyPath,
    errorPath,
    timeoutMs: LOCAL_RUNTIME_READY_TIMEOUT_MS,
  })

  return { child, baseUrl }
}

function resolveSeedAccount(entries: SeedAccountEntry[], requestedPodName?: string): Omit<LocalSeedConfig, 'seedConfigPath'> {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Seed config must contain at least one account with one pod')
  }

  const matchedAccount = requestedPodName
    ? entries.find((entry) => entry.pods?.some((pod) => pod.name === requestedPodName))
    : entries[0]

  const account = matchedAccount ?? entries[0]
  const podName = requestedPodName ?? account.pods?.[0]?.name

  if (!account?.email || !account.password || !podName) {
    throw new Error('Seed config must provide email, password, and at least one pod name')
  }

  return {
    email: account.email,
    password: account.password,
    podName,
  }
}

async function prepareLocalSeedConfig(runtimeRoot: string): Promise<LocalSeedConfig> {
  const requestedPodName = process.env.XPOD_TEST_POD_NAME?.trim() || undefined
  const explicitSeedConfig = process.env.XPOD_TEST_SEED_CONFIG

  if (explicitSeedConfig) {
    const seedConfigPath = resolve(explicitSeedConfig)
    const parsed = readJson<SeedAccountEntry[]>(seedConfigPath)
    if (!parsed) {
      throw new Error(`Failed to read XPOD_TEST_SEED_CONFIG from ${seedConfigPath}`)
    }
    return {
      seedConfigPath,
      ...resolveSeedAccount(parsed, requestedPodName),
    }
  }

  const seedConfigPath = join(runtimeRoot, 'seed-accounts.json')
  const email = process.env.XPOD_TEST_SEED_EMAIL || 'test-integration@example.com'
  const password = process.env.XPOD_TEST_SEED_PASSWORD || 'TestIntegration123!'
  const podName = requestedPodName || 'test'
  const seedAccounts: SeedAccountEntry[] = [
    {
      email,
      password,
      pods: [{ name: podName }],
    },
  ]

  await writeFile(seedConfigPath, `${JSON.stringify(seedAccounts, null, 2)}\n`, 'utf-8')

  return {
    seedConfigPath,
    email,
    password,
    podName,
  }
}

async function loginSeedAccount(fetchFn: typeof fetch, baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetchFn(new URL('.account/login/password/', baseUrl).href, {
    method: 'POST',
    headers: closeConnectionHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Failed to login seeded account ${email}: ${response.status} ${text}`)
  }

  const payload = await response.json() as { authorization?: string }
  if (!payload.authorization) {
    throw new Error(`Seeded account ${email} login did not return CSS account token`)
  }

  return payload.authorization
}

async function getAccountPayload(fetchFn: typeof fetch, baseUrl: string, accountToken: string): Promise<AccountPayload> {
  const response = await fetchFn(new URL('.account/', baseUrl).href, {
    headers: closeConnectionHeaders({
      Accept: 'application/json',
      Authorization: `CSS-Account-Token ${accountToken}`,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Failed to fetch seeded account controls: ${response.status} ${text}`)
  }

  return await response.json() as AccountPayload
}

async function createSeedClientCredentials(fetchFn: typeof fetch, options: {
  accountToken: string
  accountPayload: AccountPayload
  webId: string
}): Promise<{ clientId: string; clientSecret: string }> {
  const endpoint = options.accountPayload.controls?.account?.clientCredentials
  if (!endpoint) {
    throw new Error('Seeded account does not expose clientCredentials control endpoint')
  }

  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: closeConnectionHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `CSS-Account-Token ${options.accountToken}`,
    }),
    body: JSON.stringify({
      name: `linx-integration-${Date.now()}`,
      webId: options.webId,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Failed to create seed client credentials: ${response.status} ${text}`)
  }

  const payload = await response.json() as { id?: string; secret?: string }
  if (!payload.id || !payload.secret) {
    throw new Error('Seeded account credentials response did not include id/secret')
  }

  return {
    clientId: payload.id,
    clientSecret: payload.secret,
  }
}

async function exchangeClientCredentialsForAccessToken(fetchFn: typeof fetch, options: {
  baseUrl: string
  clientId: string
  clientSecret: string
}): Promise<string> {
  const discoveryResponse = await fetchFn(new URL('.well-known/openid-configuration', options.baseUrl).href, {
    headers: closeConnectionHeaders({
      Accept: 'application/json',
    }),
  })

  if (!discoveryResponse.ok) {
    const text = await discoveryResponse.text().catch(() => '')
    throw new Error(`Failed to discover local OIDC configuration: ${discoveryResponse.status} ${text}`)
  }

  const discovery = await discoveryResponse.json() as { token_endpoint?: string }
  if (!discovery.token_endpoint) {
    throw new Error('Local OIDC discovery did not return token_endpoint')
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: options.clientId,
    client_secret: options.clientSecret,
  })

  const tokenResponse = await fetchFn(discovery.token_endpoint, {
    method: 'POST',
    headers: closeConnectionHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    }),
    body: params.toString(),
  })

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text().catch(() => '')
    throw new Error(`Failed to exchange local client credentials: ${tokenResponse.status} ${text}`)
  }

  const tokenPayload = await tokenResponse.json() as { access_token?: string }
  if (!tokenPayload.access_token) {
    throw new Error('Local token exchange did not return access_token')
  }

  return tokenPayload.access_token
}

function resolveSeedWebId(accountPayload: AccountPayload, baseUrl: string, podName: string): string {
  const webIds = Object.keys(accountPayload.webIds ?? {})
  const matchedWebId = webIds.find((webId) => webId.includes(`/${podName}/`))

  return matchedWebId ?? webIds[0] ?? new URL(`${podName}/profile/card#me`, baseUrl).href
}

function readCredentialsFromEnv(): ExternalAuthConfig | null {
  const url = process.env.XPOD_TEST_URL
  const webId = process.env.XPOD_TEST_WEBID
  const clientId = process.env.XPOD_TEST_CLIENT_ID
  const clientSecret = process.env.XPOD_TEST_CLIENT_SECRET

  if (!url || !webId || !clientId || !clientSecret) {
    return null
  }

  return {
    url,
    webId,
    clientId,
    clientSecret,
    source: 'env',
  }
}

function readCredentialsFromCli(): ExternalAuthConfig | null {
  const home = homedir()
  const dirs = [join(home, '.linx'), join(home, '.xpod')]

  for (const sourceDir of dirs) {
    const configPath = join(sourceDir, 'config.json')
    const secretsPath = join(sourceDir, 'secrets.json')

    if (!existsSync(configPath) || !existsSync(secretsPath)) {
      continue
    }

    const config = readJson<StoredConfig>(configPath)
    const secrets = readJson<StoredSecrets>(secretsPath)

    if (!config || !secrets) {
      continue
    }

    if (
      typeof config.url !== 'string' ||
      typeof config.webId !== 'string' ||
      typeof secrets.clientId !== 'string' ||
      typeof secrets.clientSecret !== 'string'
    ) {
      continue
    }

    return {
      url: config.url,
      webId: config.webId,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      source: 'cli',
    }
  }

  return null
}

function resolveExternalAuthConfig(): ExternalAuthConfig | null {
  return readCredentialsFromEnv() ?? readCredentialsFromCli()
}

async function createAuthenticatedContext<TSchema extends Record<string, unknown>>(
  config: ExternalAuthConfig,
  options: XpodIntegrationOptions<TSchema>,
): Promise<XpodIntegrationContext<TSchema>> {
  const session = new Session()
  await session.login({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    oidcIssuer: config.url,
    tokenType: 'Bearer',
  })

  if (!session.info.isLoggedIn) {
    throw new Error(`Failed to authenticate against xpod (${config.source})`)
  }

  const webId = session.info.webId ?? config.webId
  const db = drizzle<TSchema>(session as unknown as SolidAuthSession, {
    disableInteropDiscovery: true,
    schema: options.schema,
  })

  await db.init(options.tables as never[])
  await options.initialize?.(db)

  return {
    mode: 'external-auth',
    db,
    baseUrl: config.url,
    webId,
    apiKey: buildApiKey(config.clientId, config.clientSecret),
    stop: async () => {
      await db.disconnect().catch(() => undefined)
      await session.logout()
    },
  }
}

async function createLocalSeededContext<TSchema extends Record<string, unknown>>(
  options: XpodIntegrationOptions<TSchema>,
): Promise<XpodIntegrationContext<TSchema>> {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'linx-xpod-runtime-'))
  let runtime: { child: ChildProcess; baseUrl: string } | null = null

  try {
    const seed = await prepareLocalSeedConfig(runtimeRoot)
    let lastStartError: unknown

    for (let attempt = 0; attempt < LOCAL_RUNTIME_START_RETRIES; attempt += 1) {
      const ports = pickLocalRuntimePorts()

      try {
        runtime = await startLocalRuntimeProcess({
          runtimeRoot,
          seedConfigPath: seed.seedConfigPath,
          baseUrl: ports.baseUrl,
          gatewayPort: ports.gatewayPort,
          cssPort: ports.cssPort,
          apiPort: ports.apiPort,
        })
        break
      } catch (error) {
        lastStartError = error
        if (!isPortConflictError(error) || attempt === LOCAL_RUNTIME_START_RETRIES - 1) {
          throw error
        }
      }
    }

    if (!runtime) {
      throw lastStartError instanceof Error ? lastStartError : new Error('Failed to start local xpod runtime')
    }
    const activeRuntime = runtime

    const fetchFn: typeof fetch = async (input, init) => {
      if (typeof input === 'string' || input instanceof URL) {
        return fetch(new URL(String(input), activeRuntime.baseUrl), init)
      }
      return fetch(input, init)
    }

    const accountToken = await loginSeedAccount(fetchFn, activeRuntime.baseUrl, seed.email, seed.password)
    const accountPayload = await getAccountPayload(fetchFn, activeRuntime.baseUrl, accountToken)
    const webId = resolveSeedWebId(accountPayload, activeRuntime.baseUrl, seed.podName)
    const credentials = await createSeedClientCredentials(fetchFn, {
      accountToken,
      accountPayload,
      webId,
    })
    const accessToken = await exchangeClientCredentialsForAccessToken(fetchFn, {
      baseUrl: runtime.baseUrl,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
    })

    const session: SolidAuthSession = {
      info: {
        isLoggedIn: true,
        webId,
        sessionId: `xpod-seed-${seed.podName}`,
      },
      fetch: async (input, init) => {
        const headers = closeConnectionHeaders(init?.headers)
        headers.set('Authorization', `Bearer ${accessToken}`)
        return fetchFn(input, {
          ...init,
          headers,
        })
      },
    }

    const db = drizzle<TSchema>(session, {
      disableInteropDiscovery: true,
      schema: options.schema,
    })

    await db.init(options.tables as never[])
    await options.initialize?.(db)

    return {
      mode: 'local-seeded-auth',
      db,
      baseUrl: runtime.baseUrl,
      webId,
      apiKey: buildApiKey(credentials.clientId, credentials.clientSecret),
      stop: async () => {
        await db.disconnect().catch(() => undefined)
        if (runtime) {
          await stopLocalRuntimeProcess(runtime.child).catch(() => undefined)
        }
        await rm(runtimeRoot, { recursive: true, force: true })
      },
    }
  } catch (error) {
    if (runtime) {
      await stopLocalRuntimeProcess(runtime.child).catch(() => undefined)
    }
    await rm(runtimeRoot, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export async function createXpodIntegrationContext<TSchema extends Record<string, unknown>>(
  options: XpodIntegrationOptions<TSchema>,
): Promise<XpodIntegrationContext<TSchema>> {
  const requestedMode = getRequestedMode()
  const external = requestedMode === 'local' ? null : resolveExternalAuthConfig()

  if (external) {
    return createAuthenticatedContext(external, options)
  }

  if (requestedMode === 'auth') {
    throw new Error(
      'XPOD_TEST_MODE=auth requires XPOD_TEST_URL/XPOD_TEST_WEBID/XPOD_TEST_CLIENT_ID/XPOD_TEST_CLIENT_SECRET or ~/.xpod credentials',
    )
  }

  return createLocalSeededContext(options)
}
