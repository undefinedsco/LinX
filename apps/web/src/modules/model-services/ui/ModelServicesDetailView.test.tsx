import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelServicesDetailView, type ModelServicesDetailViewProps } from './ModelServicesDetailView'

function renderView(overrides: Partial<ModelServicesDetailViewProps> = {}) {
  const props: ModelServicesDetailViewProps = {
    provider: {
      id: 'openai',
      name: 'OpenAI',
      description: 'Provider description',
      enabled: true,
      modelCount: 1,
      capabilities: ['chat_completions'],
      models: [{
        id: 'gpt-4o',
        name: 'GPT-4o',
        capabilities: ['vision'],
      }],
    },
    queryError: null,
    mutationError: null,
    localApiKey: '',
    localBaseUrl: 'https://api.openai.com/v1',
    showKey: false,
    isVerifying: false,
    modelSearch: '',
    isPlatformProvider: false,
    verificationRequiresApiKey: true,
    onApiKeyChange: vi.fn(),
    onBaseUrlChange: vi.fn(),
    onCapabilityChange: vi.fn(async () => {}),
    onSaveConnection: vi.fn(async () => {}),
    onToggleKeyVisibility: vi.fn(),
    onToggleEnable: vi.fn(async () => {}),
    onVerify: vi.fn(async () => {}),
    onModelSearchChange: vi.fn(),
    onAddModel: vi.fn(),
    onEditModel: vi.fn(),
    onDeleteModel: vi.fn(async () => {}),
    onCopyModelId: vi.fn(async () => {}),
    ...overrides,
  }

  render(<ModelServicesDetailView {...props} />)
}

describe('ModelServicesDetailView tooltip accessibility', () => {
  it('makes the provider description tooltip trigger keyboard focusable', () => {
    renderView()

    const trigger = screen.getByRole('button', { name: '提供商说明' })
    trigger.focus()

    expect(trigger).toHaveFocus()
  })

  it('makes capability tooltip triggers keyboard focusable', () => {
    renderView()

    const trigger = screen.getByRole('button', { name: '视觉识别' })
    trigger.focus()

    expect(trigger).toHaveFocus()
  })
})

describe('ModelServicesDetailView model row accessibility', () => {
  it('keeps named model actions visible when keyboard focus enters the row', () => {
    renderView()

    const copy = screen.getByRole('button', { name: '复制 GPT-4o ID' })
    const edit = screen.getByRole('button', { name: '编辑 GPT-4o' })
    const remove = screen.getByRole('button', { name: '删除 GPT-4o' })

    expect(copy).toHaveClass('group-focus-within:opacity-100')
    expect(edit.parentElement).toHaveClass('focus-within:opacity-100')

    edit.focus()
    expect(edit).toHaveFocus()
    expect(remove).toHaveAccessibleName('删除 GPT-4o')
  })
})
