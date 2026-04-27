import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface LocalXpodTestPod {
  webId: string
  podUrl: string
  clientId: string
  clientSecret: string
  oidcIssuer: string
  baseUrl: string
  sparqlEndpoint: string
  stop: () => Promise<void>
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForReady(baseUrl: string, child?: ChildProcess, stderr?: string[]): Promise<void> {
  const openidUrl = new URL('.well-known/openid-configuration', baseUrl).href
  let lastError: unknown

  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (child && child.exitCode !== null) {
      throw new Error(`External local xpod exited before becoming ready (code=${child.exitCode}).${stderr?.length ? `\nstderr:\n${stderr.join('')}` : ''}`)
    }
    try {
      const response = await fetch(openidUrl)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await wait(250)
  }

  throw new Error(`External local xpod did not become ready at ${baseUrl}: ${lastError instanceof Error ? lastError.message : String(lastError)}${stderr?.length ? `\nstderr:\n${stderr.join('')}` : ''}`)
}

function normalizeServiceUrl(rawUrl: string, baseUrl: string): string {
  try {
    const source = new URL(rawUrl)
    const base = new URL(baseUrl)
    if (source.origin === base.origin) return source.toString()
    return new URL(`${source.pathname}${source.search}${source.hash}`, base).toString()
  } catch {
    return new URL(rawUrl, baseUrl).toString()
  }
}

async function discoverOidcIssuerFromWebId(webId: string, fallbackIssuer: string): Promise<string> {
  try {
    const profileUrl = webId.split('#')[0]
    const response = await fetch(profileUrl, {
      headers: { accept: 'text/turtle, application/ld+json;q=0.9, application/rdf+xml;q=0.8' },
    })
    if (!response.ok) return ensureTrailingSlash(fallbackIssuer)

    const body = await response.text()
    const discoveredRaw =
      body.match(/<http:\/\/www\.w3\.org\/ns\/solid\/terms#oidcIssuer>\s*<([^>]+)>/)?.[1] ??
      body.match(/solid:oidcIssuer\s*<([^>]+)>/)?.[1]

    if (!discoveredRaw) return ensureTrailingSlash(fallbackIssuer)
    return ensureTrailingSlash(new URL(discoveredRaw, profileUrl).toString())
  } catch {
    return ensureTrailingSlash(fallbackIssuer)
  }
}

async function setupAccount(baseUrl: string): Promise<{
  webId: string
  podUrl: string
  clientId: string
  clientSecret: string
  issuer: string
}> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const podName = `linx-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  const accountResponse = await fetch(new URL('.account/account/', baseUrl), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!accountResponse.ok) {
    throw new Error(`Local xpod account creation failed: HTTP ${accountResponse.status} ${await accountResponse.text().catch(() => '')}`)
  }

  const account = await accountResponse.json() as { authorization?: string }
  if (!account.authorization) throw new Error('Local xpod account creation did not return authorization token')

  const controlsResponse = await fetch(new URL('.account/', baseUrl), {
    headers: { accept: 'application/json', authorization: `CSS-Account-Token ${account.authorization}` },
  })
  if (!controlsResponse.ok) {
    throw new Error(`Local xpod account controls lookup failed: HTTP ${controlsResponse.status} ${await controlsResponse.text().catch(() => '')}`)
  }

  const controls = await controlsResponse.json() as {
    controls?: {
      password?: { create?: string }
      account?: { pod?: string; clientCredentials?: string }
    }
  }

  const passwordUrl = controls.controls?.password?.create
  if (passwordUrl) {
    const passwordResponse = await fetch(normalizeServiceUrl(passwordUrl, baseUrl), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `CSS-Account-Token ${account.authorization}`,
      },
      body: JSON.stringify({ email: `${podName}@test.local`, password: 'test123456' }),
    })
    if (!passwordResponse.ok) {
      throw new Error(`Local xpod password setup failed: HTTP ${passwordResponse.status} ${await passwordResponse.text().catch(() => '')}`)
    }
  }

  const podUrl = controls.controls?.account?.pod
  if (!podUrl) throw new Error(`Local xpod controls did not expose pod creation URL: ${JSON.stringify(controls.controls)}`)

  const podResponse = await fetch(normalizeServiceUrl(podUrl, baseUrl), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `CSS-Account-Token ${account.authorization}`,
    },
    body: JSON.stringify({ name: podName }),
  })
  if (!podResponse.ok) {
    throw new Error(`Local xpod pod creation failed: HTTP ${podResponse.status} ${await podResponse.text().catch(() => '')}`)
  }

  const pod = await podResponse.json() as { webId?: string; pod?: string }
  const webId = normalizeServiceUrl(pod.webId ?? new URL(`${podName}/profile/card#me`, baseUrl).href, baseUrl)
  const createdPodUrl = normalizeServiceUrl(pod.pod ?? new URL(`${podName}/`, baseUrl).href, baseUrl)

  const credentialsUrl = controls.controls?.account?.clientCredentials
  if (!credentialsUrl) throw new Error(`Local xpod controls did not expose client credentials URL: ${JSON.stringify(controls.controls)}`)

  const credentialsResponse = await fetch(normalizeServiceUrl(credentialsUrl, baseUrl), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `CSS-Account-Token ${account.authorization}`,
    },
    body: JSON.stringify({ name: `${podName}-client`, webId }),
  })
  if (!credentialsResponse.ok) {
    throw new Error(`Local xpod client credentials creation failed: HTTP ${credentialsResponse.status} ${await credentialsResponse.text().catch(() => '')}`)
  }

  const credentials = await credentialsResponse.json() as { id?: string; secret?: string }
  if (!credentials.id || !credentials.secret) {
    throw new Error(`Local xpod client credentials response missing id/secret: ${JSON.stringify(credentials)}`)
  }

  return {
    webId,
    podUrl: createdPodUrl,
    clientId: credentials.id,
    clientSecret: credentials.secret,
    issuer: await discoverOidcIssuerFromWebId(webId, baseUrl),
  }
}

async function tryExternalBaseUrl(): Promise<string | null> {
  const configured = process.env.LINX_TEST_XPOD_BASE_URL || process.env.XPOD_TEST_BASE_URL || process.env.CSS_BASE_URL
  if (!configured) return null
  const baseUrl = ensureTrailingSlash(configured)
  const response = await fetch(new URL('.well-known/openid-configuration', baseUrl).href, {
    signal: AbortSignal.timeout(5000),
  }).catch(() => null)
  return response?.ok ? baseUrl : null
}

function resolveXpodNode(): string {
  if (process.env.XPOD_TEST_NODE) return process.env.XPOD_TEST_NODE

  // Keep xpod's native sqlite addon out of the LinX/Vitest process. If this
  // checkout has Node 22 via nvm, use it for the isolated xpod child because
  // the installed xpod native modules are commonly built for Node 22 ABI.
  const nvmNode22 = path.join(process.env.HOME ?? '', '.nvm/versions/node/v22.21.1/bin/node')
  if (fs.existsSync(nvmNode22)) return nvmNode22

  return process.execPath
}

interface SpawnedXpodRuntime {
  baseUrl: string
  sparqlEndpoint: string
  child: ChildProcess
  stop: () => Promise<void>
}

async function startExternalOpenXpod(runtimeRoot: string): Promise<SpawnedXpodRuntime> {
  const childScript = path.resolve(__dirname, 'local-xpod-child.mjs')
  const nodeBinary = resolveXpodNode()
  const stderr: string[] = []
  const stdout: string[] = []

  const child = spawn(nodeBinary, [childScript], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      LINX_XPOD_RUNTIME_ROOT: runtimeRoot,
      CSS_LOGGING_LEVEL: process.env.CSS_LOGGING_LEVEL ?? 'warn',
    },
  })

  child.stderr?.on('data', (chunk) => stderr.push(String(chunk)))

  const ready = await new Promise<{ baseUrl: string; sparqlEndpoint: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`External open xpod child did not become ready. node=${nodeBinary}${stdout.length ? `\nstdout:\n${stdout.join('')}` : ''}${stderr.length ? `\nstderr:\n${stderr.join('')}` : ''}`))
    }, 60_000)

    const cleanup = () => {
      clearTimeout(timeout)
      child.stdout?.off('data', onStdout)
      child.off('exit', onExit)
      child.off('error', onError)
    }

    const onStdout = (chunk: Buffer) => {
      const text = String(chunk)
      stdout.push(text)
      for (const line of text.split('\n')) {
        if (!line.startsWith('LINX_XPOD_READY ')) continue
        cleanup()
        try {
          resolve(JSON.parse(line.slice('LINX_XPOD_READY '.length)))
        } catch (error) {
          reject(error)
        }
      }
    }

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      reject(new Error(`External open xpod child exited before ready (code=${code}, signal=${signal}).${stdout.length ? `\nstdout:\n${stdout.join('')}` : ''}${stderr.length ? `\nstderr:\n${stderr.join('')}` : ''}`))
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    child.stdout?.on('data', onStdout)
    child.once('exit', onExit)
    child.once('error', onError)
  })

  const stop = async () => {
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM')
      await wait(1000)
      if (child.exitCode === null && !child.killed) child.kill('SIGKILL')
    }
  }

  await waitForReady(ready.baseUrl, child, stderr)

  return {
    baseUrl: ensureTrailingSlash(ready.baseUrl),
    sparqlEndpoint: ready.sparqlEndpoint,
    child,
    stop,
  }
}

export async function startLocalXpod(): Promise<LocalXpodTestPod> {
  const externalBaseUrl = await tryExternalBaseUrl()
  if (externalBaseUrl) {
    const account = await setupAccount(externalBaseUrl)
    return {
      webId: account.webId,
      podUrl: account.podUrl,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      oidcIssuer: account.issuer,
      baseUrl: externalBaseUrl,
      sparqlEndpoint: new URL('/.data/-/sparql', externalBaseUrl).href,
      stop: async () => undefined,
    }
  }

  const testDataRoot = path.resolve(process.cwd(), '../../.test-data')
  fs.mkdirSync(testDataRoot, { recursive: true })
  const runtimeRoot = fs.mkdtempSync(path.join(testDataRoot, 'linx-xpod-'))
  const spawned = await startExternalOpenXpod(runtimeRoot)

  const stop = async () => {
    await spawned.stop()
    fs.rmSync(runtimeRoot, { recursive: true, force: true })
  }

  try {
    const account = await setupAccount(spawned.baseUrl)
    return {
      webId: account.webId,
      podUrl: account.podUrl,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      oidcIssuer: account.issuer,
      baseUrl: spawned.baseUrl,
      sparqlEndpoint: spawned.sparqlEndpoint,
      stop,
    }
  } catch (error) {
    await stop()
    throw error
  }
}
