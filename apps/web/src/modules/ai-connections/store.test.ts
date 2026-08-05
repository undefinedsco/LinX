import { describe, it, expect, beforeEach } from 'vitest'
import { useAiConnectionsStore } from './store'

describe('useAiConnectionsStore (UI only)', () => {
  beforeEach(() => {
    useAiConnectionsStore.setState({
      selectedProviderId: 'openai',
      search: '',
    })
  })

  it('sets selected provider', () => {
    useAiConnectionsStore.getState().setSelectedProviderId('anthropic')
    expect(useAiConnectionsStore.getState().selectedProviderId).toBe('anthropic')
  })

  it('updates search', () => {
    useAiConnectionsStore.getState().setSearch('claude')
    expect(useAiConnectionsStore.getState().search).toBe('claude')
  })
})
