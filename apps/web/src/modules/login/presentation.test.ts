import { describe, expect, it } from 'vitest'
import { getProviderActionLabel, getProviderStatusBadge, getProviderSubtitle } from './presentation'
import type { LoginProviderOption } from './types'

function createLocalProvider(
  overrides: Partial<LoginProviderOption> = {},
): LoginProviderOption {
  return {
    id: 'local',
    url: 'http://localhost:5737',
    label: 'Local',
    source: 'local',
    runtime: {
      kind: 'local-pod',
      status: 'missing',
      canStart: true,
      canCreate: true,
    },
    ...overrides,
  }
}

describe('getProviderSubtitle', () => {
  it('uses product copy for Cloud', () => {
    const provider: LoginProviderOption = {
      id: 'cloud',
      url: 'https://cloud.example.com',
      label: 'Cloud',
      source: 'cloud',
      isDefault: true,
    }

    expect(getProviderSubtitle(provider, false)).toBe('官方云端空间')
  })

  it('uses onboarding state for first-time Local setup', () => {
    const provider = createLocalProvider({
      runtime: {
        kind: 'local-pod',
        status: 'missing',
        canStart: true,
        canCreate: true,
        onboarding: {
          state: 'mode_required',
          mode: null,
          message: null,
        },
      },
    })

    expect(getProviderSubtitle(provider, false)).toBe('这台设备上的本地空间')
  })

  it('uses onboarding state for resumable Local setup', () => {
    const provider = createLocalProvider({
      runtime: {
        kind: 'local-pod',
        status: 'stopped',
        canStart: true,
        canCreate: false,
        onboarding: {
          state: 'idle',
          mode: 'device-only',
          message: null,
        },
      },
    })

    expect(getProviderSubtitle(provider, false)).toBe('这台设备上的本地空间')
  })

  it('uses onboarding state for Local repair flow', () => {
    const provider = createLocalProvider({
      runtime: {
        kind: 'local-pod',
        status: 'stopped',
        canStart: true,
        canCreate: false,
        onboarding: {
          state: 'repair_required',
          mode: 'remote-ready',
          message: null,
        },
      },
    })

    expect(getProviderSubtitle(provider, false)).toBe('这台设备上的本地空间')
  })

  it('falls back to runtime status when onboarding state is unavailable', () => {
    const provider = createLocalProvider({
      runtime: {
        kind: 'local-pod',
        status: 'starting',
        canStart: false,
        canCreate: false,
      },
    })

    expect(getProviderSubtitle(provider, false)).toBe('这台设备上的本地空间')
  })
})

describe('getProviderStatusBadge', () => {
  it('maps Cloud to an official badge', () => {
    const provider: LoginProviderOption = {
      id: 'cloud',
      url: 'https://cloud.example.com',
      label: 'Cloud',
      source: 'cloud',
      isDefault: true,
    }

    expect(getProviderStatusBadge(provider)).toEqual({
      label: '官方',
      tone: 'primary',
    })
  })

  it('maps Local repair flow to a warning badge', () => {
    const provider = createLocalProvider({
      runtime: {
        kind: 'local-pod',
        status: 'stopped',
        canStart: true,
        canCreate: false,
        onboarding: {
          state: 'repair_required',
          mode: 'remote-ready',
          message: null,
        },
      },
    })

    expect(getProviderStatusBadge(provider)).toEqual({
      label: '需设置',
      tone: 'warning',
    })
  })

  it('maps Local ready flow to a success badge', () => {
    const provider = createLocalProvider({
      runtime: {
        kind: 'local-pod',
        status: 'running',
        canStart: false,
        canCreate: false,
        onboarding: {
          state: 'ready',
          mode: 'device-only',
          message: null,
        },
      },
    })

    expect(getProviderStatusBadge(provider)).toEqual({
      label: '就绪',
      tone: 'success',
    })
  })
})

describe('getProviderActionLabel', () => {
  it('maps Cloud to a direct login action', () => {
    const provider: LoginProviderOption = {
      id: 'cloud',
      url: 'https://cloud.example.com',
      label: 'Cloud',
      source: 'cloud',
      isDefault: true,
    }

    expect(getProviderActionLabel(provider)).toBe('登录')
  })

  it('maps first-time Local to a start action', () => {
    const provider = createLocalProvider({
      runtime: {
        kind: 'local-pod',
        status: 'missing',
        canStart: true,
        canCreate: true,
        onboarding: {
          state: 'mode_required',
          mode: null,
          message: null,
        },
      },
    })

    expect(getProviderActionLabel(provider)).toBe('开始')
  })

  it('maps repair Local to settings action', () => {
    const provider = createLocalProvider({
      runtime: {
        kind: 'local-pod',
        status: 'error',
        canStart: true,
        canCreate: false,
        onboarding: {
          state: 'repair_required',
          mode: 'remote-ready',
          message: null,
        },
      },
    })

    expect(getProviderActionLabel(provider)).toBe('设置')
  })

  it('maps ready Local to login action', () => {
    const provider = createLocalProvider({
      runtime: {
        kind: 'local-pod',
        status: 'running',
        canStart: false,
        canCreate: false,
        onboarding: {
          state: 'ready',
          mode: 'device-only',
          message: null,
        },
      },
    })

    expect(getProviderActionLabel(provider)).toBe('登录')
  })
})
