import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ============================================================================
// 状态机定义
// ============================================================================

/**
 * 登录状态机
 *
 * INIT → RESTORING → LOGGED_IN (成功)
 *              ↓ (失败/超时)
 *        SELECTING_PROVIDER ←→ CONNECTING
 *              ↓ (成功)
 *          LOGGED_IN
 */
export type LoginState =
  | 'init'              // 初始化中
  | 'restoring'         // 恢复会话中
  | 'selecting'         // 选择 Provider
  | 'connecting'        // 连接中
  | 'logged_in'         // 已登录

// ============================================================================
// 类型定义
// ============================================================================

export interface StoredAccount {
  displayName: string
  avatarUrl?: string
  issuerUrl: string
  issuerLabel?: string
  webId?: string
}

export interface ProviderOption {
  id: string
  url: string
  label: string
  logoUrl?: string
  isDefault?: boolean
}

export interface LoginStore {
  // 状态
  state: LoginState
  error: string | null
  failedProvider: string | null  // 上次失败的 provider URL

  // 数据
  selectedProvider: string | null
  storedAccount: StoredAccount | null
  customProviders: ProviderOption[]

  // Actions
  setState: (state: LoginState) => void
  setError: (error: string | null) => void
  setFailedProvider: (url: string | null) => void
  setSelectedProvider: (url: string | null) => void
  setStoredAccount: (account: StoredAccount | null) => void
  addCustomProvider: (provider: ProviderOption) => void
  removeCustomProvider: (url: string) => void

  // 复合 Actions
  loginFailed: (error: string, providerUrl: string) => void
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
      state: 'init',
      error: null,
      failedProvider: null,
      selectedProvider: null,
      storedAccount: null,
      customProviders: [],

      // 基础 Actions
      setState: (state) => set({ state }),
      setError: (error) => set({ error }),
      setFailedProvider: (url) => set({ failedProvider: url }),
      setSelectedProvider: (url) => set({ selectedProvider: url }),
      setStoredAccount: (account) => set({ storedAccount: account }),

      addCustomProvider: (provider) => set((s) => ({
        customProviders: [
          provider,
          ...s.customProviders.filter(p => p.url !== provider.url)
        ].slice(0, 10)  // 最多保存 10 个
      })),

      removeCustomProvider: (url) => set((s) => ({
        customProviders: s.customProviders.filter(p => p.url !== url)
      })),

      // 复合 Actions
      loginFailed: (error, providerUrl) => set({
        state: 'selecting',
        error,
        failedProvider: providerUrl,
      }),

      loginSuccess: (account) => set({
        state: 'logged_in',
        error: null,
        failedProvider: null,
        storedAccount: account,
      }),

      reset: () => set({
        state: 'selecting',
        error: null,
        failedProvider: null,
        selectedProvider: null,
      }),
    }),
    {
      name: 'linx-login',
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
    url: 'https://lgnxxsoohipf.sealosgzg.site',
    label: 'LinX Cloud',
    logoUrl: '/linx-logo.svg',
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
