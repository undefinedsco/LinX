import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const originalHome = process.env.HOME

test.afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME
    return
  }

  process.env.HOME = originalHome
})

function writeCredentialSet(baseDir, folderName, values) {
  const dir = join(baseDir, folderName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), JSON.stringify(values.config))
  writeFileSync(join(dir, 'secrets.json'), JSON.stringify(values.secrets))
}

test('saveCredentials persists client credentials under ~/.linx and clearCredentials removes them', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-cli-creds-'))
  process.env.HOME = tempHome

  const mod = await import(`../dist/lib/credentials-store.js?save=${Date.now()}`)
  mod.saveCredentials({
    url: 'https://linx.example',
    webId: 'https://pod.example/profile#me',
    authType: 'client_credentials',
    secrets: {
      clientId: 'linx-client',
      clientSecret: 'linx-secret',
    },
  })

  assert.equal(existsSync(join(tempHome, '.linx', 'config.json')), true)
  assert.equal(existsSync(join(tempHome, '.linx', 'secrets.json')), true)
  assert.equal(statSync(join(tempHome, '.linx', 'config.json')).mode & 0o777, 0o644)
  assert.equal(statSync(join(tempHome, '.linx', 'secrets.json')).mode & 0o777, 0o600)
  assert.match(readFileSync(join(tempHome, '.linx', 'config.json'), 'utf-8'), /linx\.example/)
  assert.equal(mod.loadCredentials()?.sourceDir, join(tempHome, '.linx'))

  mod.clearCredentials()
  assert.equal(existsSync(join(tempHome, '.linx', 'config.json')), false)
  assert.equal(existsSync(join(tempHome, '.linx', 'secrets.json')), false)
})

test('loadCredentials reads credentials from ~/.linx', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-cli-creds-'))
  process.env.HOME = tempHome

  writeCredentialSet(tempHome, '.linx', {
    config: {
      url: 'https://linx.example',
      webId: 'https://pod.example/profile#me',
      authType: 'client_credentials',
    },
    secrets: {
      clientId: 'linx-client',
      clientSecret: 'linx-secret',
    },
  })

  const { loadCredentials } = await import('../dist/lib/credentials-store.js')
  const credentials = loadCredentials()

  assert.ok(credentials)
  assert.equal(credentials.url, 'https://linx.example')
  assert.equal(credentials.sourceDir, join(tempHome, '.linx'))
})

test('loadCredentials ignores legacy ~/.xpod credentials', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-cli-creds-'))
  process.env.HOME = tempHome

  writeCredentialSet(tempHome, '.xpod', {
    config: {
      url: 'https://xpod.example',
      webId: 'https://pod.example/profile#me',
      authType: 'client_credentials',
    },
    secrets: {
      clientId: 'xpod-client',
      clientSecret: 'xpod-secret',
    },
  })

  const { loadCredentials } = await import(`../dist/lib/credentials-store.js?xpod-only=${Date.now()}`)
  assert.equal(loadCredentials(), null)
})

test('loadCredentials returns null for incomplete secrets', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-cli-creds-'))
  process.env.HOME = tempHome

  writeCredentialSet(tempHome, '.linx', {
    config: {
      url: 'https://linx.example',
      webId: 'https://pod.example/profile#me',
      authType: 'client_credentials',
    },
    secrets: {
      clientId: 'linx-client',
    },
  })

  const { loadCredentials } = await import(`../dist/lib/credentials-store.js?incomplete=${Date.now()}`)

  assert.equal(loadCredentials(), null)
})
