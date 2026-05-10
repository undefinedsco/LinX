import { describe, it, expect, beforeEach } from 'vitest'
import { useContactStore } from './store'

describe('useContactStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useContactStore.setState({
      search: '',
      listFilter: 'all',
      selectedId: null,
      viewMode: 'view',
      createDialogOpen: false,
      createType: null,
    })
  })

  describe('Initial State', () => {
    it('has correct initial values', () => {
      const state = useContactStore.getState()
      
      expect(state.search).toBe('')
      expect(state.selectedId).toBe(null)
      expect(state.viewMode).toBe('view')
      expect(state.createDialogOpen).toBe(false)
      expect(state.createType).toBe(null)
    })
  })

  describe('setSearch', () => {
    it('updates search term', () => {
      useContactStore.getState().setSearch('test query')
      
      expect(useContactStore.getState().search).toBe('test query')
    })

    it('clears search term', () => {
      useContactStore.getState().setSearch('test')
      useContactStore.getState().setSearch('')
      
      expect(useContactStore.getState().search).toBe('')
    })
  })

  describe('select', () => {
    it('selects a contact by id', () => {
      useContactStore.getState().select('contact-123')
      
      expect(useContactStore.getState().selectedId).toBe('contact-123')
      expect(useContactStore.getState().viewMode).toBe('view')
    })

    it('deselects when null is passed', () => {
      useContactStore.getState().select('contact-123')
      useContactStore.getState().select(null)
      
      expect(useContactStore.getState().selectedId).toBe(null)
    })

    it('resets viewMode to view when selecting', () => {
      useContactStore.getState().startEdit()
      useContactStore.getState().select('contact-123')
      
      expect(useContactStore.getState().viewMode).toBe('view')
    })
  })

  describe('openCreateDialog', () => {
    it('opens dialog with agent type', () => {
      useContactStore.getState().openCreateDialog('agent')
      
      expect(useContactStore.getState().createDialogOpen).toBe(true)
      expect(useContactStore.getState().createType).toBe('agent')
    })

    it('opens dialog with friend type', () => {
      useContactStore.getState().openCreateDialog('friend')
      
      expect(useContactStore.getState().createDialogOpen).toBe(true)
      expect(useContactStore.getState().createType).toBe('friend')
    })
  })

  describe('closeCreateDialog', () => {
    it('closes dialog and clears type', () => {
      useContactStore.getState().openCreateDialog('agent')
      useContactStore.getState().closeCreateDialog()
      
      expect(useContactStore.getState().createDialogOpen).toBe(false)
      expect(useContactStore.getState().createType).toBe(null)
    })
  })

  describe('startEdit', () => {
    it('sets viewMode to edit when a contact is selected', () => {
      useContactStore.getState().select('contact-123')
      useContactStore.getState().startEdit()
      
      expect(useContactStore.getState().viewMode).toBe('edit')
    })

    it('does not change viewMode when no contact is selected', () => {
      useContactStore.getState().startEdit()
      
      expect(useContactStore.getState().viewMode).toBe('view')
    })
  })

  describe('cancelEdit', () => {
    it('returns to view mode', () => {
      useContactStore.getState().select('contact-123')
      useContactStore.getState().startEdit()
      useContactStore.getState().cancelEdit()
      
      expect(useContactStore.getState().viewMode).toBe('view')
    })

    it('preserves selectedId when canceling', () => {
      useContactStore.getState().select('contact-123')
      useContactStore.getState().startEdit()
      useContactStore.getState().cancelEdit()
      
      expect(useContactStore.getState().selectedId).toBe('contact-123')
    })
  })

  describe('State Transitions', () => {
    it('handles view -> edit -> cancel flow', () => {
      // Start in view mode
      expect(useContactStore.getState().viewMode).toBe('view')
      
      // Select a contact
      useContactStore.getState().select('contact-123')
      expect(useContactStore.getState().viewMode).toBe('view')
      
      // Start editing
      useContactStore.getState().startEdit()
      expect(useContactStore.getState().viewMode).toBe('edit')
      
      // Cancel edit
      useContactStore.getState().cancelEdit()
      expect(useContactStore.getState().viewMode).toBe('view')
      expect(useContactStore.getState().selectedId).toBe('contact-123')
    })

    it('handles create dialog flow', () => {
      // Open create dialog for agent
      useContactStore.getState().openCreateDialog('agent')
      expect(useContactStore.getState().createDialogOpen).toBe(true)
      expect(useContactStore.getState().createType).toBe('agent')
      
      // Close dialog
      useContactStore.getState().closeCreateDialog()
      expect(useContactStore.getState().createDialogOpen).toBe(false)
      expect(useContactStore.getState().createType).toBe(null)
    })
  })
})
