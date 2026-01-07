import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SearchableSelect } from './searchable-select'
import React from 'react'

interface Option {
  id: string
  label: string
}

const STATIC_OPTIONS: Option[] = [
  { id: '1', label: 'Apple' },
  { id: '2', label: 'Banana' },
  { id: '3', label: 'Cherry' },
]

describe('SearchableSelect', () => {
  it('renders correctly with local options', () => {
    const handleChange = vi.fn()
    render(
      <SearchableSelect
        options={STATIC_OPTIONS}
        getLabel={(item) => item.label}
        getValue={(item) => item.id}
        onChange={handleChange}
        placeholder="Select a fruit"
      />
    )

    expect(screen.getByPlaceholderText('Select a fruit')).toBeInTheDocument()
    fireEvent.focus(screen.getByPlaceholderText('Select a fruit'))
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('Banana')).toBeInTheDocument()
  })

  it('filters local options based on input', () => {
    const handleChange = vi.fn()
    render(
      <SearchableSelect
        options={STATIC_OPTIONS}
        getLabel={(item) => item.label}
        getValue={(item) => item.id}
        onChange={handleChange}
      />
    )

    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'app' } })

    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.queryByText('Banana')).not.toBeInTheDocument()
  })

  it('handles remote search with debounce', async () => {
    const mockSearch = vi.fn(async (query: string) => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return STATIC_OPTIONS.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    })
    const handleChange = vi.fn()

    render(
      <SearchableSelect
        onSearch={mockSearch}
        getLabel={(item) => item.label}
        getValue={(item) => item.id}
        onChange={handleChange}
      />
    )

    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ban' } })

    expect(screen.getByRole('status')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith('ban')
      expect(screen.getByText('Banana')).toBeInTheDocument()
      expect(screen.queryByText('Apple')).not.toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    }, { timeout: 500 })
  })

  it('allows creating new options', async () => {
    const handleCreate = vi.fn()
    const handleChange = vi.fn()

    render(
      <SearchableSelect
        options={STATIC_OPTIONS}
        getLabel={(item) => item.label}
        getValue={(item) => item.id}
        onChange={handleChange}
        allowCreate
        onCreate={handleCreate}
      />
    )

    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Grape' } })

    expect(screen.getByText('Create "Grape"')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Create "Grape"'))

    expect(handleCreate).toHaveBeenCalledWith('Grape')
    expect(handleChange).not.toHaveBeenCalled()
  })

  // Fixed: Use rerender to simulate controlled component behavior
  it('calls onChange when an option is selected', () => {
    const handleChange = vi.fn()
    const { rerender } = render(
      <SearchableSelect
        options={STATIC_OPTIONS}
        getLabel={(item) => item.label}
        getValue={(item) => item.id}
        onChange={handleChange}
        value={null}
      />
    )

    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.click(screen.getByText('Apple'))

    expect(handleChange).toHaveBeenCalledWith(STATIC_OPTIONS[0])
    
    // Simulate parent updating state
    rerender(
      <SearchableSelect
        options={STATIC_OPTIONS}
        getLabel={(item) => item.label}
        getValue={(item) => item.id}
        onChange={handleChange}
        value={STATIC_OPTIONS[0]}
      />
    )
    
    expect(screen.getByRole('textbox')).toHaveValue('Apple')
  })

  it('clears input on select if clearOnSelect is true', () => {
    const handleChange = vi.fn()
    render(
      <SearchableSelect
        options={STATIC_OPTIONS}
        getLabel={(item) => item.label}
        getValue={(item) => item.id}
        onChange={handleChange}
        clearOnSelect={true}
      />
    )

    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'app' } })
    fireEvent.click(screen.getByText('Apple'))

    expect(handleChange).toHaveBeenCalledWith(STATIC_OPTIONS[0])
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  // Fixed: Use rerender for controlled behavior
  it('handles keyboard navigation (ArrowDown, Enter)', () => {
    const handleChange = vi.fn()
    const { rerender } = render(
      <SearchableSelect
        options={STATIC_OPTIONS}
        getLabel={(item) => item.label}
        getValue={(item) => item.id}
        onChange={handleChange}
        value={null}
      />
    )

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' }) 
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleChange).toHaveBeenCalledWith(STATIC_OPTIONS[1])

    // Simulate parent updating state
    rerender(
      <SearchableSelect
        options={STATIC_OPTIONS}
        getLabel={(item) => item.label}
        getValue={(item) => item.id}
        onChange={handleChange}
        value={STATIC_OPTIONS[1]}
      />
    )

    expect(input).toHaveValue('Banana')
  })
})
