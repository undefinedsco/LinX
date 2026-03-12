import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

test('loadCredentials prefers ~/.linx over ~/.xpod', async () => {
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

  const { loadCredentials } = await import('../dist/lib/credentials-store.cjs')
  const credentials = loadCredentials()

  assert.ok(credentials)
  assert.equal(credentials.url, 'https://linx.example')
  assert.equal(credentials.sourceDir, join(tempHome, '.linx'))
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

  const { loadCredentials } = await import('../dist/lib/credentials-store.cjs')

  assert.equal(loadCredentials(), null)
})
