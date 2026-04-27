import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export interface SelfHostedSolidPod {
  webId: string
  clientId: string
  clientSecret: string
  oidcIssuer: string
  baseUrl: string
  stop: () => Promise<void>
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForCssReady(baseUrl: string): Promise<void> {
  const url = new URL('.well-known/openid-configuration', baseUrl).href
  let lastError: unknown

  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await wait(150)
  }

  throw new Error(`Self-hosted CSS did not become ready at ${baseUrl}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(new URL('.account/login/password/', baseUrl).href, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'secret!',
      remember: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`Self-hosted CSS login failed: HTTP ${response.status} ${await response.text()}`)
  }

  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) {
    throw new Error('Self-hosted CSS login did not return css-account cookie')
  }
  return cookie
}

async function createClientCredentials(baseUrl: string, cookie: string): Promise<{ id: string; secret: string }> {
  const accountResponse = await fetch(new URL('.account/', baseUrl).href, { headers: { cookie } })
  if (!accountResponse.ok) {
    throw new Error(`Self-hosted CSS account lookup failed: HTTP ${accountResponse.status} ${await accountResponse.text()}`)
  }
  const account = await accountResponse.json() as { controls?: { account?: { clientCredentials?: string } } }
  const credentialsUrl = account.controls?.account?.clientCredentials
  if (!credentialsUrl) {
    throw new Error('Self-hosted CSS account controls did not include clientCredentials URL')
  }

  const response = await fetch(credentialsUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: `linx-test-${Date.now()}`,
      webId: new URL('profile/card#me', baseUrl).href,
    }),
  })

  if (!response.ok) {
    throw new Error(`Self-hosted CSS client credential creation failed: HTTP ${response.status} ${await response.text()}`)
  }

  const body = await response.json() as { id?: string; secret?: string }
  if (!body.id || !body.secret) {
    throw new Error('Self-hosted CSS client credential response did not include id/secret')
  }
  return { id: body.id, secret: body.secret }
}


function createSelfHostedTestConfig(cssRoot: string): string {
  const upstreamConfigPath = require.resolve('@solid/community-server/config/file-root-pod.json')
  const config = JSON.parse(fs.readFileSync(upstreamConfigPath, 'utf8')) as { import?: string[] }

  // Test-only setup: keep the seeded OIDC/account root pod, but make LDP access
  // permissive so integration tests prove real Pod I/O without depending on WAC
  // bootstrap details. Use the memory backend so each self-hosted test pod is isolated and fast.
  config.import = (config.import ?? []).map((entry) => {
    if (entry === 'css:config/ldp/authorization/webacl.json') {
      return 'css:config/ldp/authorization/allow-all.json'
    }
    if (entry === 'css:config/storage/backend/file.json') {
      return 'css:config/storage/backend/memory.json'
    }
    return entry
  })

  const configPath = path.join(cssRoot, 'file-root-pod-allow-all-memory.json')
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  return configPath
}

export async function startSelfHostedSolidPod(): Promise<SelfHostedSolidPod> {
  const cssRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-css-'))
  const serverPath = require.resolve('@solid/community-server/bin/server.js')
  const configPath = createSelfHostedTestConfig(cssRoot)
  const moduleRoot = path.dirname(require.resolve('@solid/community-server/package.json'))
  const port = 43000 + Math.floor(Math.random() * 10000)
  const baseUrl = `http://127.0.0.1:${port}/`

  const child: ChildProcess = spawn(process.execPath, [
    serverPath,
    '-c', configPath,
    '-m', moduleRoot,
    '-p', String(port),
    '-b', baseUrl,
  ], {
    env: {
      ...process.env,
      CSS_ROOT_FILE_PATH: cssRoot,
      CSS_LOGGING_LEVEL: 'error',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  const stderr: string[] = []
  child.stderr?.on('data', (chunk) => {
    stderr.push(String(chunk))
  })

  const stop = async () => {
    if (!child.killed) {
      child.kill('SIGTERM')
      await wait(100)
      if (!child.killed) child.kill('SIGKILL')
    }
    fs.rmSync(cssRoot, { recursive: true, force: true })
  }

  try {
    await waitForCssReady(baseUrl)
    const cookie = await login(baseUrl)
    const credentials = await createClientCredentials(baseUrl, cookie)

    return {
      webId: new URL('profile/card#me', baseUrl).href,
      clientId: credentials.id,
      clientSecret: credentials.secret,
      oidcIssuer: baseUrl,
      baseUrl,
      stop,
    }
  } catch (error) {
    await stop()
    const detail = stderr.join('').trim()
    throw new Error(`${error instanceof Error ? error.message : String(error)}${detail ? `\nCSS stderr:\n${detail}` : ''}`)
  }
}
