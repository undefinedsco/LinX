import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock mermaid - define mock inside vi.mock factory
vi.mock('mermaid', () => {
  const mockRender = vi.fn()
  return {
    default: {
      initialize: vi.fn(),
      render: mockRender,
    },
    __mockRender: mockRender, // Expose for tests
  }
})

// Import after mock
import mermaid from 'mermaid'
import { MermaidDiagram } from './MermaidDiagram'

// Get the mock function
const mockRender = (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render

describe('MermaidDiagram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRender.mockReset()
  })

  it('shows loading state initially', () => {
    mockRender.mockImplementation(() => new Promise(() => {})) // Never resolves
    
    render(<MermaidDiagram code="graph TD; A-->B;" />)
    
    expect(screen.getByText('正在渲染图表...')).toBeInTheDocument()
  })

  it('renders SVG when mermaid succeeds', async () => {
    mockRender.mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg">Test SVG</svg>',
    })

    render(<MermaidDiagram code="graph TD; A-->B;" />)

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument()
    })
  })

  it('shows error when mermaid fails', async () => {
    mockRender.mockRejectedValue(new Error('Invalid syntax'))

    render(<MermaidDiagram code="invalid mermaid code" />)

    await waitFor(() => {
      expect(screen.getByText('Mermaid 语法错误:')).toBeInTheDocument()
    })
  })

  it('does not render when code is empty', async () => {
    render(<MermaidDiagram code="" />)

    await waitFor(() => {
      // Should not show loading after empty code
      expect(screen.queryByText('正在渲染图表...')).not.toBeInTheDocument()
    })
  })

  it('applies custom className', async () => {
    mockRender.mockResolvedValue({ svg: '<svg>Test</svg>' })

    const { container } = render(
      <MermaidDiagram code="graph TD; A-->B;" className="custom-class" />
    )

    await waitFor(() => {
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toHaveClass('custom-class')
    })
  })
})
