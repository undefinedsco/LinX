import { describe, it, expect, beforeEach } from 'vitest'
import { useModelServicesStore } from './store'

describe('useModelServicesStore (UI only)', () => {
  beforeEach(() => {
    useModelServicesStore.setState({
      selectedProviderId: 'openai',
      search: '',
    })
  })

  it('sets selected provider', () => {
    useModelServicesStore.getState().setSelectedProviderId('anthropic')
    expect(useModelServicesStore.getState().selectedProviderId).toBe('anthropic')
  })

  it('updates search', () => {
    useModelServicesStore.getState().setSearch('claude')
    expect(useModelServicesStore.getState().search).toBe('claude')
  })
})
