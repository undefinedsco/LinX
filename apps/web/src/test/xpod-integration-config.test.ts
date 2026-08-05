import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readUnifiedCredentialsFromSolidHome,
  resolveExternalAuthConfigFromEnv,
  resolveSeedAccount,
} from './xpod-integration'

describe('xpod integration smoke auth config', () => {
  it('reads external auth from the unified Solid login store', () => {
    const root = mkdtempSync(join(tmpdir(), 'linx-xpod-auth-config-'))
    const solidHome = join(root, 'solid-home')
    mkdirSync(join(solidHome, 'auth'), { recursive: true })
    writeFileSync(join(solidHome, 'auth', 'credentials.json'), JSON.stringify({
      url: 'https://id.undefineds.co/',
      webId: 'https://id.undefineds.co/smoke/profile/card#me',
      authType: 'client_credentials',
      secrets: {
        clientId: 'solid-client-id',
        clientSecret: 'solid-client-secret',
      },
    }))

    expect(readUnifiedCredentialsFromSolidHome({ SOLID_HOME: solidHome })).toEqual({
      url: 'https://id.undefineds.co/',
      webId: 'https://id.undefineds.co/smoke/profile/card#me',
      podUrl: undefined,
      clientId: 'solid-client-id',
      clientSecret: 'solid-client-secret',
      source: 'solid-home',
    })
  })

  it('does not treat XPOD_TEST_URL style auth variables as smoke credentials', () => {
    const emptyHome = mkdtempSync(join(tmpdir(), 'linx-xpod-empty-home-'))
    expect(resolveExternalAuthConfigFromEnv({
      SOLID_HOME: join(emptyHome, 'missing-solid-home'),
      XPOD_TEST_URL: 'https://id.undefineds.co/',
      XPOD_TEST_WEBID: 'https://id.undefineds.co/smoke/profile/card#me',
      XPOD_TEST_CLIENT_ID: 'old-client-id',
      XPOD_TEST_CLIENT_SECRET: 'old-client-secret',
    })).toBeNull()
  })

  it('resolves seeded local account details from seed config content only', () => {
    expect(resolveSeedAccount([
      {
        email: 'seed@example.com',
        password: 'seed-password',
        pods: [{ name: 'seed-pod' }],
      },
    ])).toEqual({
      email: 'seed@example.com',
      password: 'seed-password',
      podName: 'seed-pod',
    })
  })
})
