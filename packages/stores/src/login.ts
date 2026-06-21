import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ============================================================================
// 状态机定义
// ============================================================================

/**
 * 登录状态机
 *
 * restoring → idle → connecting → authenticated
 */
export type LoginState =
  | 'restoring'         // 静默恢复缓存 session
  | 'idle'              // 等待用户操作（头像卡片 or provider 选择）
  | 'connecting'        // 正在连接（含 Local 自动启动）
  | 'authenticated'     // 已登录

// ============================================================================
// 类型定义
// ============================================================================

export interface StoredAccount {
  displayName: string
  avatarUrl?: string
  issuerUrl: string
  issuerLabel?: string
  storageProviderUrl?: string
  storageProviderLabel?: string
  webId?: string
}

export interface ProviderOption {
  id: string
  url: string
  label: string
  logoUrl?: string
  isDefault?: boolean
}

const REMEMBERED_ACCOUNT_KEY = 'linx-remembered-account'
const LINX_CLOUD_IDENTITY_ORIGIN = 'https://id.undefineds.co'

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage ?? null
}

function persistRememberedAccount(account: StoredAccount | null): void {
  const storage = getBrowserStorage()
  if (!storage) return

  if (!account) {
    storage.removeItem(REMEMBERED_ACCOUNT_KEY)
    return
  }

  storage.setItem(REMEMBERED_ACCOUNT_KEY, JSON.stringify(account))
}

export function getRememberedAccount(): StoredAccount | null {
  const storage = getBrowserStorage()
  if (!storage) return null

  const raw = storage.getItem(REMEMBERED_ACCOUNT_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAccount> & {
      providerUrl?: string
      providerLabel?: string
    }
    const storageProviderLabel = resolveStorageProviderLabel(parsed)
    const issuerUrl = resolveStoredAccountIssuerUrl(parsed, storageProviderLabel)
    if (typeof parsed.displayName !== 'string' || !issuerUrl) {
      return null
    }

    return {
      displayName: parsed.displayName,
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : undefined,
      issuerUrl,
      issuerLabel: typeof parsed.issuerLabel === 'string' ? parsed.issuerLabel : undefined,
      storageProviderUrl: typeof parsed.storageProviderUrl === 'string'
        ? parsed.storageProviderUrl
        : normalizeStoredUrl(parsed.providerUrl) ?? undefined,
      storageProviderLabel,
      webId: typeof parsed.webId === 'string' ? parsed.webId : undefined,
    }
  } catch {
    storage.removeItem(REMEMBERED_ACCOUNT_KEY)
    return null
  }
}

function migrateStoredAccount(value: unknown): StoredAccount | null {
  if (!value || typeof value !== 'object') return null

  const parsed = value as Partial<StoredAccount> & {
    providerUrl?: string
    providerLabel?: string
  }
  const storageProviderLabel = resolveStorageProviderLabel(parsed)
  const issuerUrl = resolveStoredAccountIssuerUrl(parsed, storageProviderLabel)
  const storageProviderUrl = normalizeStoredUrl(parsed.storageProviderUrl)
    ?? normalizeStoredUrl(parsed.providerUrl)

  if (typeof parsed.displayName !== 'string' || !issuerUrl) {
    return null
  }

  return {
    displayName: parsed.displayName,
    avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : undefined,
    issuerUrl,
    issuerLabel: typeof parsed.issuerLabel === 'string' ? parsed.issuerLabel : undefined,
    storageProviderUrl: storageProviderUrl ?? undefined,
    storageProviderLabel,
    webId: typeof parsed.webId === 'string' ? parsed.webId : undefined,
  }
}

function resolveStoredAccountIssuerUrl(
  parsed: Partial<StoredAccount> & { providerUrl?: string; providerLabel?: string },
  storageProviderLabel?: string,
): string | null {
  const explicitIssuerUrl = normalizeStoredUrl(parsed.issuerUrl)
  if (explicitIssuerUrl) {
    return explicitIssuerUrl
  }

  if (isLegacyCloudBackedLocalAccount(parsed, storageProviderLabel)) {
    return LINX_CLOUD_IDENTITY_ORIGIN
  }

  return normalizeStoredUrl(parsed.providerUrl)
}

function resolveStorageProviderLabel(
  parsed: Partial<StoredAccount> & { providerLabel?: string },
): string | undefined {
  if (typeof parsed.storageProviderLabel === 'string') {
    return parsed.storageProviderLabel
  }
  if (typeof parsed.providerLabel === 'string') {
    return parsed.providerLabel
  }
  return undefined
}

function isLegacyCloudBackedLocalAccount(
  parsed: Partial<StoredAccount>,
  storageProviderLabel?: string,
): boolean {
  return storageProviderLabel?.trim().toLowerCase() === 'local'
    && typeof parsed.webId === 'string'
    && normalizeStoredUrl(parsed.webId)?.startsWith(`${LINX_CLOUD_IDENTITY_ORIGIN}/`) === true
}

export interface LoginStore {
  // 状态
  state: LoginState
  error: string | null

  // 数据
  storedAccount: StoredAccount | null
  customProviders: ProviderOption[]

  // Actions
  setState: (state: LoginState) => void
  setError: (error: string | null) => void
  setStoredAccount: (account: StoredAccount | null) => void
  addCustomProvider: (provider: ProviderOption) => void
  removeCustomProvider: (url: string) => void

  // 复合 Actions
  loginSuccess: (account: StoredAccount) => void
  reset: () => void
}

// ============================================================================
// Store 实现
// ============================================================================

export const useLoginStore = create<LoginStore>()(
  persist(
    (set) => ({
      // 初始状态
      state: 'restoring' as LoginState,
      error: null,
      storedAccount: null,
      customProviders: [],

      // 基础 Actions
      setState: (state) => set((current) => current.state === state ? current : { state }),
      setError: (error) => set((current) => current.error === error ? current : { error }),
      setStoredAccount: (account) => set((current) => {
        if (current.storedAccount === account) return current
        persistRememberedAccount(account)
        return { storedAccount: account }
      }),

      addCustomProvider: (provider) => set((s) => ({
        customProviders: [
          provider,
          ...s.customProviders.filter(p => p.url !== provider.url)
        ].slice(0, 10)
      })),

      removeCustomProvider: (url) => set((s) => ({
        customProviders: s.customProviders.filter(p => p.url !== url)
      })),

      // 复合 Actions
      loginSuccess: (account) => set(() => {
        persistRememberedAccount(account)
        return {
          state: 'authenticated' as LoginState,
          error: null,
          storedAccount: account,
        }
      }),

      reset: () => set((current) => {
        persistRememberedAccount(current.storedAccount)
        return {
          state: 'idle' as LoginState,
          error: null,
        }
      }),
    }),
    {
      name: 'linx-login',
      version: 1,
      migrate: (persistedState) => {
        const state = persistedState as { storedAccount?: unknown; customProviders?: unknown }
        return {
          storedAccount: migrateStoredAccount(state.storedAccount),
          customProviders: Array.isArray(state.customProviders) ? state.customProviders : [],
        }
      },
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage
        }
        // SSR fallback
        const memory: Record<string, string> = {}
        return {
          getItem: (key) => memory[key] ?? null,
          setItem: (key, value) => { memory[key] = value },
          removeItem: (key) => { delete memory[key] },
        }
      }),
      // 只持久化这些字段
      partialize: (state) => ({
        storedAccount: state.storedAccount,
        customProviders: state.customProviders,
      }),
    }
  )
)

// ============================================================================
// 默认 Providers
// ============================================================================

export const DEFAULT_PROVIDERS: ProviderOption[] = [
  {
    id: 'linx-cloud',
    url: 'https://id.undefineds.co',
    label: 'Cloud',
    logoUrl: '/linx-logo.png',
    isDefault: true,
  },
]

// ============================================================================
// 辅助函数
// ============================================================================

export function getAllProviders(customProviders: ProviderOption[]): ProviderOption[] {
  const map = new Map<string, ProviderOption>()

  // 先添加默认的
  DEFAULT_PROVIDERS.forEach(p => map.set(p.url, p))

  // 再添加自定义的（会覆盖同 URL 的默认项）
  customProviders.forEach(p => map.set(p.url, { ...p, isDefault: false }))

  return Array.from(map.values())
}

function normalizeStoredUrl(url?: string | null): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  return trimmed.length > 0 ? trimmed : null
}
