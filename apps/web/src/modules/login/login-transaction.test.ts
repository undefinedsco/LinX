import { describe, expect, it } from 'vitest'
import {
  createLoginTransaction,
  getLoginTransactionRetryEntryUrl,
  inferLoginRoute,
  isLocalLoginTransaction,
  isSplitLocalLoginTransaction,
  normalizeLoginTransaction,
} from './login-transaction'

describe('login-transaction', () => {
  it('models Cloud as one account and storage provider', () => {
    const transaction = createLoginTransaction({
      oidcEntryUrl: 'https://id.undefineds.co/',
      authorizationSurface: 'window',
      returnToMicroAppId: 'files',
      storageProviderLabel: 'Cloud',
      createdAt: 1,
      id: 'cloud-login',
    })

    expect(transaction).toEqual({
      id: 'cloud-login',
      route: 'cloud',
      oidcEntryUrl: 'https://id.undefineds.co',
      oidcIssuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      authorizationSurface: 'window',
      returnToMicroAppId: 'files',
      storageProviderUrl: 'https://id.undefineds.co',
      storageProviderLabel: 'Cloud',
      createdAt: 1,
    })
  })

  it('models Cloud account plus Local storage without losing the Local entry URL', () => {
    const transaction = createLoginTransaction({
      route: 'local',
      oidcEntryUrl: 'https://node-0000.undefineds.co/',
      oidcIssuerUrl: 'https://id.undefineds.co/',
      accountIssuerUrl: 'https://id.undefineds.co/',
      accountIssuerLabel: 'Cloud',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
        empty: '',
      },
      strictDiscovery: true,
      nodeId: 'node-0000',
      createdAt: 2,
      id: 'local-login',
    })

    expect(transaction).toEqual({
      id: 'local-login',
      route: 'local',
      oidcEntryUrl: 'https://node-0000.undefineds.co',
      oidcIssuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      storageProviderUrl: 'https://node-0000.undefineds.co',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      strictDiscovery: true,
      nodeId: 'node-0000',
      createdAt: 2,
    })
    expect(getLoginTransactionRetryEntryUrl(transaction!)).toBe('https://node-0000.undefineds.co')
    expect(isLocalLoginTransaction(transaction)).toBe(true)
    expect(isSplitLocalLoginTransaction(transaction)).toBe(true)
  })

  it('models Standalone as local identity and local storage', () => {
    const transaction = createLoginTransaction({
      route: 'standalone',
      oidcEntryUrl: 'http://localhost:5737/',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      storageProviderUrl: 'http://localhost:5737/',
      storageProviderLabel: 'Standalone',
      createdAt: 3,
      id: 'standalone-login',
    })

    expect(transaction).toMatchObject({
      id: 'standalone-login',
      route: 'standalone',
      oidcEntryUrl: 'http://localhost:5737',
      oidcIssuerUrl: 'http://localhost:5737',
      accountIssuerUrl: 'http://localhost:5737',
      storageProviderUrl: 'http://localhost:5737',
      storageProviderLabel: 'Standalone',
    })
    expect(isLocalLoginTransaction(transaction)).toBe(true)
    expect(isSplitLocalLoginTransaction(transaction)).toBe(false)
  })

  it('models a Custom provider as a single external provider by default', () => {
    const transaction = createLoginTransaction({
      oidcEntryUrl: 'https://solid.example.net/',
      authorizationSurface: 'window',
      returnToMicroAppId: 'contacts',
      storageProviderUrl: 'https://solid.example.net/',
      storageProviderLabel: 'Example Solid',
      createdAt: 4,
      id: 'custom-login',
    })

    expect(transaction).toMatchObject({
      id: 'custom-login',
      route: 'custom',
      oidcEntryUrl: 'https://solid.example.net',
      oidcIssuerUrl: 'https://solid.example.net',
      accountIssuerUrl: 'https://solid.example.net',
      storageProviderUrl: 'https://solid.example.net',
      storageProviderLabel: 'Example Solid',
    })
  })

  it('keeps an explicitly custom split provider from being reclassified as Local', () => {
    const transaction = createLoginTransaction({
      route: 'custom',
      oidcEntryUrl: 'https://auth.example.net/',
      oidcIssuerUrl: 'https://auth.example.net/',
      accountIssuerUrl: 'https://auth.example.net/',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
      storageProviderUrl: 'https://storage.example.net/',
      storageProviderLabel: 'Example Storage',
      createdAt: 5,
      id: 'custom-split-login',
    })

    expect(transaction).toMatchObject({
      id: 'custom-split-login',
      route: 'custom',
      oidcEntryUrl: 'https://auth.example.net',
      oidcIssuerUrl: 'https://auth.example.net',
      accountIssuerUrl: 'https://auth.example.net',
      storageProviderUrl: 'https://storage.example.net',
    })
    expect(getLoginTransactionRetryEntryUrl(transaction!)).toBe('https://auth.example.net')
  })

  it('infers only unlabeled split Undefineds storage as Local', () => {
    expect(inferLoginRoute({
      oidcIssuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'https://node-0000.undefineds.co',
    })).toBe('local')

    expect(inferLoginRoute({
      oidcIssuerUrl: 'https://solid.example.net',
      accountIssuerUrl: 'https://solid.example.net',
      storageProviderUrl: 'https://solid.example.net',
    })).toBe('custom')
  })

  it('normalizes persisted transaction payloads and rejects invalid payloads', () => {
    expect(normalizeLoginTransaction({
      route: 'cloud',
      oidcEntryUrl: 'https://id.undefineds.co/',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
      createdAt: 6,
      id: 'persisted-login',
    })).toMatchObject({
      id: 'persisted-login',
      route: 'cloud',
      oidcEntryUrl: 'https://id.undefineds.co',
      createdAt: 6,
    })

    expect(normalizeLoginTransaction(null)).toBeNull()
    expect(normalizeLoginTransaction({ authorizationSurface: 'window' })).toBeNull()
  })
})
