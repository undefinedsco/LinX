import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ModelSelector } from './model-selector'

// Mock ResizeObserver for Radix UI components
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

describe('ModelSelector', () => {
  describe('Rendering', () => {
    it('renders with placeholder when no value is selected', () => {
      render(<ModelSelector />)
      expect(screen.getByText('选择模型...')).toBeInTheDocument()
    })

    it('renders with custom placeholder', () => {
      render(<ModelSelector placeholder="Pick a model" />)
      expect(screen.getByText('Pick a model')).toBeInTheDocument()
    })

    it('renders selected model name when value is provided', () => {
      render(<ModelSelector value="gpt-4o" />)
      expect(screen.getByText('GPT-4o')).toBeInTheDocument()
    })

    it('renders provider icon for selected model', () => {
      render(<ModelSelector value="claude-3-5-sonnet-latest" />)
      // Provider icon shows first letter
      expect(screen.getByText('A')).toBeInTheDocument() // Anthropic
    })
  })

  describe('Dialog Interaction', () => {
    it('opens dialog when button is clicked', async () => {
      render(<ModelSelector />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索模型...')).toBeInTheDocument()
      })
    })

    it('shows chat models by default', async () => {
      render(<ModelSelector type="chat" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        // Use getAllByText since multiple providers may have same model name (e.g., OpenRouter + OpenAI)
        expect(screen.getAllByText('GPT-4o').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Claude 3.5 Sonnet').length).toBeGreaterThan(0)
      })
    })

    it('shows voice models when type is voice', async () => {
      render(<ModelSelector type="voice" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getByText('TTS-1')).toBeInTheDocument()
        expect(screen.getByText('Turbo v2')).toBeInTheDocument()
      })
    })

    it('shows video models when type is video', async () => {
      render(<ModelSelector type="video" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getByText('Avatar v2')).toBeInTheDocument()
      })
    })

    it('groups models by provider', async () => {
      render(<ModelSelector type="chat" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument()
        expect(screen.getByText('Anthropic')).toBeInTheDocument()
      })
    })
  })

  describe('Search Functionality', () => {
    it('filters models by search query', async () => {
      render(<ModelSelector type="chat" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索模型...')).toBeInTheDocument()
      })
      
      fireEvent.change(screen.getByPlaceholderText('搜索模型...'), { target: { value: 'gpt' } })
      
      await waitFor(() => {
        expect(screen.getAllByText('GPT-4o').length).toBeGreaterThan(0)
        expect(screen.queryAllByText('Claude 3.5 Sonnet').length).toBe(0)
      })
    })

    it('shows empty state when no models match search', async () => {
      render(<ModelSelector type="chat" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索模型...')).toBeInTheDocument()
      })
      
      fireEvent.change(screen.getByPlaceholderText('搜索模型...'), { target: { value: 'nonexistent' } })
      
      await waitFor(() => {
        expect(screen.getByText('没有找到模型')).toBeInTheDocument()
      })
    })

    it('search is case insensitive', async () => {
      render(<ModelSelector type="chat" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索模型...')).toBeInTheDocument()
      })
      
      fireEvent.change(screen.getByPlaceholderText('搜索模型...'), { target: { value: 'CLAUDE' } })
      
      await waitFor(() => {
        expect(screen.getAllByText('Claude 3.5 Sonnet').length).toBeGreaterThan(0)
      })
    })
  })

  describe('Tag Filtering', () => {
    it('displays capability tags in Chinese', async () => {
      render(<ModelSelector type="chat" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        // Tags are displayed in Chinese
        expect(screen.getByText('视觉')).toBeInTheDocument()
        expect(screen.getByText('工具')).toBeInTheDocument()
      })
    })

    it('filters models by capability tag', async () => {
      render(<ModelSelector type="chat" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getByText('视觉')).toBeInTheDocument()
      })
      
      // Click on "视觉" (Vision) tag to filter
      fireEvent.click(screen.getByText('视觉'))
      
      // Models with vision capability should remain visible
      await waitFor(() => {
        expect(screen.getAllByText('GPT-4o').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Claude 3.5 Sonnet').length).toBeGreaterThan(0)
      })
    })

    it('can toggle tag filter off', async () => {
      render(<ModelSelector type="chat" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getByText('视觉')).toBeInTheDocument()
      })
      
      // Toggle vision tag on
      fireEvent.click(screen.getByText('视觉'))
      
      // Toggle vision tag off
      fireEvent.click(screen.getByText('视觉'))
      
      await waitFor(() => {
        expect(screen.getAllByText('GPT-4o').length).toBeGreaterThan(0)
      })
    })
  })

  describe('Selection', () => {
    it('calls onChange when model is selected', async () => {
      const onChange = vi.fn()
      render(<ModelSelector onChange={onChange} />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getAllByText('GPT-4o').length).toBeGreaterThan(0)
      })
      
      // Click the first model item row containing GPT-4o
      const modelRows = document.querySelectorAll('[class*="cursor-pointer"]')
      const gpt4oRow = Array.from(modelRows).find(row => row.textContent?.includes('GPT-4o'))
      if (gpt4oRow) {
        fireEvent.click(gpt4oRow)
      }
      
      expect(onChange).toHaveBeenCalled()
    })

    it('closes dialog after selection', async () => {
      const onChange = vi.fn()
      render(<ModelSelector onChange={onChange} />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索模型...')).toBeInTheDocument()
      })
      
      const modelRows = document.querySelectorAll('[class*="cursor-pointer"]')
      const gpt4oRow = Array.from(modelRows).find(row => row.textContent?.includes('GPT-4o'))
      if (gpt4oRow) {
        fireEvent.click(gpt4oRow)
      }
      
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('搜索模型...')).not.toBeInTheDocument()
      })
    })

    it('shows check mark for selected model', async () => {
      render(<ModelSelector value="gpt-4o" />)
      
      fireEvent.click(screen.getByRole('button'))
      
      await waitFor(() => {
        // The selected model row should have a check icon (lucide-check class)
        const checkIcons = document.querySelectorAll('svg.lucide-check')
        expect(checkIcons.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Custom className', () => {
    it('applies custom className to button', () => {
      render(<ModelSelector className="custom-class" />)
      expect(screen.getByRole('button')).toHaveClass('custom-class')
    })
  })
})
