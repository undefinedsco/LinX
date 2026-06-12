import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const originalHome = process.env.HOME
const originalUserProfile = process.env.USERPROFILE

test.afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = originalHome
  }

  if (originalUserProfile === undefined) {
    delete process.env.USERPROFILE
  } else {
    process.env.USERPROFILE = originalUserProfile
  }
})

function setTestHome(home) {
  process.env.HOME = home
  process.env.USERPROFILE = home
}

function solidAuthDir(baseDir) {
  return join(baseDir, '.solid', 'auth')
}

function solidCredentialsPath(baseDir) {
  return join(solidAuthDir(baseDir), 'credentials.json')
}

function writeCredentialEnvelope(baseDir, values) {
  const dir = solidAuthDir(baseDir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(solidCredentialsPath(baseDir), JSON.stringify(values))
}

function writeLegacyCredentialSet(baseDir, folderName, values) {
  const dir = join(baseDir, folderName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), JSON.stringify(values.config))
  writeFileSync(join(dir, 'secrets.json'), JSON.stringify(values.secrets))
}

test('saveCredentials persists client credentials under ~/.solid/auth and clearCredentials removes them', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-cli-creds-'))
  setTestHome(tempHome)

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

  assert.equal(existsSync(solidCredentialsPath(tempHome)), true)
  assert.equal(existsSync(join(tempHome, '.linx', 'config.json')), false)
  assert.equal(existsSync(join(tempHome, '.linx', 'secrets.json')), false)
  assert.equal(statSync(solidCredentialsPath(tempHome)).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(readFileSync(solidCredentialsPath(tempHome), 'utf-8')), {
    url: 'https://linx.example',
    webId: 'https://pod.example/profile#me',
    authType: 'client_credentials',
    secrets: {
      clientId: 'linx-client',
      clientSecret: 'linx-secret',
    },
  })
  assert.equal(mod.loadCredentials()?.sourceDir, solidAuthDir(tempHome))

  mod.clearCredentials()
  assert.equal(existsSync(solidCredentialsPath(tempHome)), false)
})

test('loadCredentials reads credentials from ~/.solid/auth', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-cli-creds-'))
  setTestHome(tempHome)

  writeCredentialEnvelope(tempHome, {
    url: 'https://linx.example',
    webId: 'https://pod.example/profile#me',
    authType: 'client_credentials',
    secrets: {
      clientId: 'linx-client',
      clientSecret: 'linx-secret',
    },
  })

  const mod = await import('../dist/lib/credentials-store.js')
  const credentials = mod.loadCredentials()

  assert.ok(credentials)
  assert.equal(credentials.url, 'https://linx.example')
  assert.equal(credentials.sourceDir, solidAuthDir(tempHome))
  assert.deepEqual(mod.getClientCredentials(credentials), {
    clientId: 'linx-client',
    clientSecret: 'linx-secret',
  })
})

test('loadCredentials normalizes alternate Solid client credential field names in memory', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-cli-creds-'))
  setTestHome(tempHome)

  writeCredentialEnvelope(tempHome, {
    url: 'https://linx.example',
    webId: 'https://pod.example/profile#me',
    authType: 'client_credentials',
    secrets: {
      secret_id: 'legacy-client',
      secret_key: 'legacy-secret',
    },
  })

  const mod = await import(`../dist/lib/credentials-store.js?legacy=${Date.now()}`)
  const credentials = mod.loadCredentials()

  assert.ok(credentials)
  assert.deepEqual(mod.getClientCredentials(credentials), {
    clientId: 'legacy-client',
    clientSecret: 'legacy-secret',
  })
})

test('loadCredentials ignores legacy app-local credentials', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-cli-creds-'))
  setTestHome(tempHome)

  writeLegacyCredentialSet(tempHome, '.xpod', {
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
  writeLegacyCredentialSet(tempHome, '.linx', {
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

  const { loadCredentials } = await import(`../dist/lib/credentials-store.js?xpod-only=${Date.now()}`)
  assert.equal(loadCredentials(), null)
})

test('loadCredentials returns null for incomplete secrets', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-cli-creds-'))
  setTestHome(tempHome)

  writeCredentialEnvelope(tempHome, {
    url: 'https://linx.example',
    webId: 'https://pod.example/profile#me',
    authType: 'client_credentials',
    secrets: {
      clientId: 'linx-client',
    },
  })

  const { loadCredentials } = await import(`../dist/lib/credentials-store.js?incomplete=${Date.now()}`)

  assert.equal(loadCredentials(), null)
})
