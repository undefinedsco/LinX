import { describe, expect, it } from 'vitest'
import {
  listLinxWhoAmIFields,
  parseLinxAccountData,
  parseLinxClientCredential,
  isLinxClientCredentialsSecrets,
  LINX_ACCOUNT_SESSION_FILE_NAME,
  LINX_CLOUD_ACCOUNT_API_BASE_URL,
  LINX_CLOUD_API_BASE_URL,
  LINX_CLOUD_API_ORIGIN,
  LINX_CLOUD_IDENTITY_ORIGIN,
  LINX_CLOUD_IDENTITY_HOSTS,
  LINX_CLOUD_RUNTIME_API_BASE_URL,
  LINX_CONFIG_FILE_NAME,
  LINX_HOME_DIRNAME,
  LINX_SECRETS_FILE_NAME,
  isLinxCloudIdentityBaseUrl,
  performLinxPasswordLogin,
  parseAccountSession,
  parseLinxClientConfig,
  parseLinxClientSecrets,
  resolveLinxPodBaseUrl,
  resolveLinxBaseUrl,
  resolveLinxCloudAccountBaseUrl,
  resolveLinxCloudApiBaseUrl,
  resolveLinxCloudRuntimeApiBaseUrl,
  resolveLinxCredentialBootstrapStatus,
  resolveLinxPodUrl,
  resolveLinxRuntimeApiBaseUrlForIssuerUrl,
  resolveLinxRuntimeOriginForIssuerUrl,
  resolveLinxRuntimeApiBaseUrl,
  selectLinxAccountWebId,
} from '../src/client'

describe('client local config shared core', () => {
  it('parses linx client config and defaults authType', () => {
    expect(LINX_HOME_DIRNAME).toBe('.linx')
    expect(LINX_CONFIG_FILE_NAME).toBe('config.json')
    expect(LINX_SECRETS_FILE_NAME).toBe('secrets.json')
    expect(LINX_ACCOUNT_SESSION_FILE_NAME).toBe('account.json')

    expect(
      parseLinxClientConfig({
        url: 'https://linx.example',
        webId: 'https://pod.example/profile#me',
      }),
    ).toEqual({
      url: 'https://linx.example',
      webId: 'https://pod.example/profile#me',
      authType: 'client_credentials',
    })
  })

  it('parses both client credential secret shapes', () => {
    const clientCredentials = parseLinxClientSecrets({
      clientId: 'linx-client',
      clientSecret: 'linx-secret',
    })

    expect(clientCredentials).toEqual({
      clientId: 'linx-client',
      clientSecret: 'linx-secret',
    })
    expect(clientCredentials && isLinxClientCredentialsSecrets(clientCredentials)).toBe(true)

    expect(
      parseLinxClientSecrets({
        oidcRefreshToken: 'refresh',
        oidcAccessToken: 'access',
        oidcExpiresAt: '2026-03-16T00:00:00.000Z',
      }),
    ).toEqual({
      oidcRefreshToken: 'refresh',
      oidcAccessToken: 'access',
      oidcExpiresAt: '2026-03-16T00:00:00.000Z',
    })
  })

  it('parses account session with optional fields', () => {
    expect(
      parseAccountSession({
        url: 'https://linx.example',
        email: 'dev@example.com',
        token: 'token_test',
        webId: 'https://pod.example/profile#me',
        podUrl: 'https://pod.example/',
        createdAt: '2026-03-16T00:00:00.000Z',
      }),
    ).toEqual({
      url: 'https://linx.example',
      email: 'dev@example.com',
      token: 'token_test',
      webId: 'https://pod.example/profile#me',
      podUrl: 'https://pod.example/',
      createdAt: '2026-03-16T00:00:00.000Z',
    })
  })

  it('normalizes account api payloads and shared url helpers', () => {
    expect(resolveLinxBaseUrl('https://linx.example')).toBe('https://linx.example/')
    expect(resolveLinxBaseUrl(undefined, 'https://fallback.example')).toBe('https://fallback.example/')
    expect(LINX_CLOUD_IDENTITY_ORIGIN).toBe('https://id.undefineds.co')
    expect(LINX_CLOUD_API_ORIGIN).toBe('https://api.undefineds.co')
    expect(LINX_CLOUD_ACCOUNT_API_BASE_URL).toBe('https://id.undefineds.co/')
    expect(LINX_CLOUD_API_BASE_URL).toBe('https://id.undefineds.co/')
    expect(LINX_CLOUD_RUNTIME_API_BASE_URL).toBe('https://api.undefineds.co/v1')
    expect(resolveLinxCloudAccountBaseUrl()).toBe('https://id.undefineds.co/')
    expect(resolveLinxCloudApiBaseUrl()).toBe('https://id.undefineds.co/')
    expect(resolveLinxCloudAccountBaseUrl('https://cloud.internal')).toBe('https://cloud.internal/')
    expect(resolveLinxCloudRuntimeApiBaseUrl()).toBe('https://api.undefineds.co/v1')
    expect(resolveLinxCloudRuntimeApiBaseUrl('https://cloud.internal')).toBe('https://cloud.internal/v1')
    expect(resolveLinxRuntimeApiBaseUrl('https://cloud.internal/v1')).toBe('https://cloud.internal/v1')
    expect(resolveLinxRuntimeApiBaseUrl('https://pod.example/runtime/')).toBe('https://pod.example/runtime/v1')
    expect(LINX_CLOUD_IDENTITY_HOSTS).toEqual(['id.undefineds.co'])
    expect(isLinxCloudIdentityBaseUrl('https://pods.undefineds.co')).toBe(false)
    expect(isLinxCloudIdentityBaseUrl('https://id.undefineds.co')).toBe(true)
    expect(isLinxCloudIdentityBaseUrl('https://alice.pods.undefineds.co')).toBe(false)
    expect(resolveLinxRuntimeOriginForIssuerUrl('https://pods.undefineds.co')).toBe('https://pods.undefineds.co')
    expect(resolveLinxRuntimeOriginForIssuerUrl('https://id.undefineds.co')).toBe('https://api.undefineds.co')
    expect(resolveLinxRuntimeOriginForIssuerUrl('https://alice.pods.undefineds.co')).toBe('https://alice.pods.undefineds.co')
    expect(resolveLinxRuntimeApiBaseUrlForIssuerUrl('https://pods.undefineds.co')).toBe('https://pods.undefineds.co/v1')
    expect(resolveLinxRuntimeApiBaseUrlForIssuerUrl('https://alice.pods.undefineds.co')).toBe('https://alice.pods.undefineds.co/v1')
    expect(resolveLinxPodUrl('https://pod.example/profile/card#me')).toBe('https://pod.example/profile/')
    expect(resolveLinxPodBaseUrl('https://pod.example/profile/card#me')).toBe('https://pod.example/profile')

    expect(
      parseLinxAccountData({
        controls: {
          account: {
            pod: 'https://pod.example/',
            clientCredentials: 'https://linx.example/.account/client-credentials/',
          },
        },
        pods: {
          'https://pod.example/': 'main',
        },
        webIds: {
          'https://pod.example/profile/card#me': 'https://pod.example/',
        },
        clientCredentials: {
          'https://linx.example/.account/client-credentials/cred_test/': 'https://pod.example/profile/card#me',
        },
      }),
    ).toEqual({
      controls: {
        pod: 'https://pod.example/',
        clientCredentials: 'https://linx.example/.account/client-credentials/',
      },
      pods: {
        'https://pod.example/': 'main',
      },
      webIds: {
        'https://pod.example/profile/card#me': 'https://pod.example/',
      },
      clientCredentials: {
        'https://linx.example/.account/client-credentials/cred_test/': 'https://pod.example/profile/card#me',
      },
    })

    expect(
      parseLinxClientCredential({
        id: 'cred_test',
        secret: 'secret_test',
        label: 'linx-cli',
        webId: 'https://pod.example/profile/card#me',
      }),
    ).toEqual({
      id: 'cred_test',
      secret: 'secret_test',
      label: 'linx-cli',
      webId: 'https://pod.example/profile/card#me',
    })
  })

  it('shares login bootstrap and whoami semantics', async () => {
    const account = {
      controls: {
        clientCredentials: 'https://linx.example/.account/client-credentials/',
      },
      pods: {
        'https://pod.example/profile/': 'main',
      },
      webIds: {
        'https://pod.example/profile/card#me': 'https://pod.example/profile/',
      },
      clientCredentials: {},
    }

    expect(selectLinxAccountWebId(account)).toBe('https://pod.example/profile/card#me')
    expect(resolveLinxCredentialBootstrapStatus({
      reusedExistingCredentials: false,
      hadMatchingStoredCredentials: true,
    })).toBe('recreated')

    const reused = await performLinxPasswordLogin({
      baseUrl: 'https://linx.example',
      email: 'dev@example.com',
      password: 'passw0rd',
      existingCredentials: {
        url: 'https://linx.example/',
        webId: 'https://pod.example/profile/card#me',
        authType: 'client_credentials',
        secrets: {
          clientId: 'cred_existing',
          clientSecret: 'secret_existing',
        },
      },
      now: new Date('2026-03-16T00:00:00.000Z'),
    }, {
      checkServer: async () => true,
      login: async () => 'token_test',
      getAccountData: async () => account,
      validateClientCredentials: async () => true,
      createClientCredentials: async () => {
        throw new Error('should not create')
      },
    })

    expect(reused.credentialStatus).toBe('reused')
    expect(reused.credentialsToSave).toBeUndefined()
    expect(reused.session).toEqual({
      url: 'https://linx.example/',
      email: 'dev@example.com',
      token: 'token_test',
      webId: 'https://pod.example/profile/card#me',
      podUrl: 'https://pod.example/profile/',
      createdAt: '2026-03-16T00:00:00.000Z',
    })

    const recreated = await performLinxPasswordLogin({
      baseUrl: 'https://linx.example',
      email: 'dev@example.com',
      password: 'passw0rd',
      existingCredentials: {
        url: 'https://linx.example/',
        webId: 'https://pod.example/profile/card#me',
        authType: 'client_credentials',
        secrets: {
          clientId: 'cred_stale',
          clientSecret: 'secret_stale',
        },
      },
      now: new Date('2026-03-16T00:00:01.000Z'),
    }, {
      checkServer: async () => true,
      login: async () => 'token_test',
      getAccountData: async () => account,
      validateClientCredentials: async () => false,
      createClientCredentials: async () => ({
        id: 'cred_new',
        secret: 'secret_new',
      }),
    })

    expect(recreated.credentialStatus).toBe('recreated')
    expect(recreated.credentialsToSave).toEqual({
      url: 'https://linx.example/',
      webId: 'https://pod.example/profile/card#me',
      authType: 'client_credentials',
      secrets: {
        clientId: 'cred_new',
        clientSecret: 'secret_new',
      },
    })

    expect(listLinxWhoAmIFields(recreated.session, { verbose: true })).toEqual([
      { key: 'email', value: 'dev@example.com' },
      { key: 'server', value: 'https://linx.example/' },
      { key: 'webId', value: 'https://pod.example/profile/card#me' },
      { key: 'pod', value: 'https://pod.example/profile/' },
      { key: 'session-created-at', value: '2026-03-16T00:00:01.000Z' },
    ])
  })
})
