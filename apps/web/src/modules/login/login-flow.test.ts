import { describe, expect, it } from 'vitest'
import {
  createInitialLoginFlowState,
  loginFlowReducer,
  selectLoginFlowVisibleError,
  type LoginFlowState,
} from './login-flow'

function readyStandaloneSnapshot() {
  return {
    state: 'ready',
    spaceKind: 'standalone',
    localUrl: 'http://localhost:5737/',
    baseUrl: 'http://localhost:5737/',
    publicUrl: null,
    tunnel: null,
    connectivity: null,
    capabilities: null,
    cloudIdentityUrl: null,
    provisionCode: null,
    provisionUrl: null,
    nodeId: null,
    message: null,
    errorCode: null,
    canRetry: true,
    canOpenSettings: true,
  } as const
}

describe('loginFlowReducer', () => {
  it('shows auth-surface errors even when the local runtime is ready', () => {
    let flow: LoginFlowState = createInitialLoginFlowState()
    flow = loginFlowReducer(flow, { type: 'set-view', view: 'local' })
    flow = loginFlowReducer(flow, { type: 'set-local-provider-source', source: 'standalone' })
    flow = loginFlowReducer(flow, {
      type: 'set-error',
      scope: 'auth-surface',
      message: '登录页面暂时打不开。请检查网络，或回到“选择空间”重试。',
    })

    expect(selectLoginFlowVisibleError({
      flow,
      storeError: flow.error?.message ?? null,
      localOnboarding: readyStandaloneSnapshot(),
    })).toBe('登录页面暂时打不开。请检查网络，或回到“选择空间”重试。')
  })

  it('still shows local startup errors in the local view', () => {
    let flow: LoginFlowState = createInitialLoginFlowState()
    flow = loginFlowReducer(flow, { type: 'set-view', view: 'local' })
    flow = loginFlowReducer(flow, {
      type: 'set-error',
      scope: 'local-start',
      message: '本地空间启动失败。请稍后重试。',
    })

    expect(selectLoginFlowVisibleError({
      flow,
      storeError: flow.error?.message ?? null,
      localOnboarding: readyStandaloneSnapshot(),
    })).toBe('本地空间启动失败。请稍后重试。')
  })

  it('reset-default returns the flow to space selection and clears transient state', () => {
    let flow: LoginFlowState = createInitialLoginFlowState()
    flow = loginFlowReducer(flow, { type: 'set-view', view: 'local' })
    flow = loginFlowReducer(flow, { type: 'set-local-provider-source', source: 'standalone' })
    flow = loginFlowReducer(flow, { type: 'set-local-login-active', active: true })
    flow = loginFlowReducer(flow, {
      type: 'set-connecting-provider',
      provider: {
        issuerLabel: 'Standalone',
        issuerUrl: 'http://localhost:5737',
        storageProviderLabel: 'Standalone',
        storageProviderUrl: 'http://localhost:5737',
      },
    })
    flow = loginFlowReducer(flow, {
      type: 'set-error',
      scope: 'auth-surface',
      message: '登录窗口打开超时，请重试。',
    })

    expect(loginFlowReducer(flow, { type: 'reset-default' })).toEqual({
      ...createInitialLoginFlowState(),
      phase: 'idle',
    })
  })

  it('owns the login runtime phase in the flow reducer', () => {
    const initial = createInitialLoginFlowState()
    const connecting = loginFlowReducer(initial, { type: 'set-phase', phase: 'connecting' })
    const authenticated = loginFlowReducer(connecting, { type: 'set-phase', phase: 'authenticated' })

    expect(initial.phase).toBe('restoring')
    expect(connecting.phase).toBe('connecting')
    expect(authenticated.phase).toBe('authenticated')
  })
})
