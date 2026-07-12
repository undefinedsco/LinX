import { describe, expect, it } from 'vitest'
import {
  buildSetupPayload,
  createSetupDraft,
  validateSetupDraft,
} from './setup-model'

describe('setup model', () => {
  it('projects persisted setup data into an editable draft', () => {
    expect(createSetupDraft({
      dataDir: ' /tmp/linx-pod ',
      port: 5738,
      publicDomain: 'https://pod.example.com/',
      tunnelProvider: 'cloudflare',
      hasTunnelToken: true,
    })).toMatchObject({
      dataDir: ' /tmp/linx-pod ',
      port: 5738,
      publicDomain: 'https://pod.example.com/',
      tunnelProvider: 'cloudflare',
      initialTunnelProvider: 'cloudflare',
      initialHasTunnelToken: true,
    })
  })

  it('builds a normalized payload without discarding hidden advanced values', () => {
    const draft = createSetupDraft({
      dataDir: '/tmp/linx-pod',
      spaceKind: 'local',
      publicDomain: 'https://pod.example.com/',
      tunnelProvider: 'cloudflare',
      hasTunnelToken: true,
    })

    expect(buildSetupPayload(draft)).toMatchObject({
      dataDir: '/tmp/linx-pod',
      publicDomain: 'pod.example.com',
      network: {
        accessMode: 'tunnel',
        tunnelProvider: 'cloudflare',
      },
    })
  })

  it('marks tunnel-token validation as an advanced-field error', () => {
    const draft = createSetupDraft({
      dataDir: '/tmp/linx-pod',
      spaceKind: 'local',
      tunnelProvider: 'cloudflare',
      hasTunnelToken: false,
    })

    expect(validateSetupDraft(draft)).toEqual({
      message: '请填写隧道密钥，或沿用已保存密钥',
      revealAdvanced: true,
    })
  })
})
