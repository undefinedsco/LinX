/**
 * Provider Adapters Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 
  getProviderAdapter, 
  providerAdapters,
  type ChatMessage,
  type ProviderConfig,
  type StreamCallbacks 
} from './index'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Provider Adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getProviderAdapter', () => {
    it('returns openai adapter for openai provider', () => {
      const adapter = getProviderAdapter('openai')
      expect(adapter.name).toBe('openai-compatible')
    })

    it('returns anthropic adapter for anthropic provider', () => {
      const adapter = getProviderAdapter('anthropic')
      expect(adapter.name).toBe('anthropic')
    })

    it('returns anthropic adapter for claude provider', () => {
      const adapter = getProviderAdapter('claude')
      expect(adapter.name).toBe('anthropic')
    })

    it('returns deepseek adapter for deepseek provider', () => {
      const adapter = getProviderAdapter('deepseek')
      expect(adapter.name).toBe('openai-compatible')
    })

    it('returns xai adapter for x-ai provider', () => {
      const adapter = getProviderAdapter('x-ai')
      expect(adapter.name).toBe('openai-compatible')
    })

    it('returns openai adapter for unknown provider (fallback)', () => {
      const adapter = getProviderAdapter('unknown-provider')
      expect(adapter.name).toBe('openai-compatible')
    })

    it('is case insensitive', () => {
      const adapter1 = getProviderAdapter('OpenAI')
      const adapter2 = getProviderAdapter('ANTHROPIC')
      expect(adapter1.name).toBe('openai-compatible')
      expect(adapter2.name).toBe('anthropic')
    })
  })

  describe('providerAdapters registry', () => {
    it('has all expected providers', () => {
      expect(Object.keys(providerAdapters)).toContain('openai')
      expect(Object.keys(providerAdapters)).toContain('anthropic')
      expect(Object.keys(providerAdapters)).toContain('claude')
      expect(Object.keys(providerAdapters)).toContain('deepseek')
      expect(Object.keys(providerAdapters)).toContain('x-ai')
      expect(Object.keys(providerAdapters)).toContain('xai')
      expect(Object.keys(providerAdapters)).toContain('groq')
      expect(Object.keys(providerAdapters)).toContain('together')
    })
  })

  describe('OpenAI-compatible adapter', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' }
    ]
    const config: ProviderConfig = {
      apiKey: 'test-key',
      model: 'gpt-4',
    }

    it('sends correct headers for openai', async () => {
      // Mock a successful stream response
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n') 
          })
          .mockResolvedValueOnce({ done: true, value: undefined })
      }
      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      })

      const callbacks: StreamCallbacks = {
        onContent: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn(),
      }

      const adapter = getProviderAdapter('openai')
      await adapter.streamChat(messages, config, callbacks)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key',
          }
        })
      )
    })

    it('uses custom baseUrl when provided', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined })
      }
      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      })

      const callbacks: StreamCallbacks = {
        onContent: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn(),
      }

      const customConfig: ProviderConfig = {
        ...config,
        baseUrl: 'https://custom.api.com/v1',
      }

      const adapter = getProviderAdapter('openai')
      await adapter.streamChat(messages, customConfig, callbacks)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/v1/chat/completions',
        expect.any(Object)
      )
    })

    it('calls onContent callback with streamed content', async () => {
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n') 
          })
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" World"}}]}\n\n') 
          })
          .mockResolvedValueOnce({ done: true, value: undefined })
      }
      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      })

      const callbacks: StreamCallbacks = {
        onContent: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn(),
      }

      const adapter = getProviderAdapter('openai')
      await adapter.streamChat(messages, config, callbacks)

      expect(callbacks.onContent).toHaveBeenCalledWith('Hello')
      expect(callbacks.onContent).toHaveBeenCalledWith('Hello World')
      expect(callbacks.onDone).toHaveBeenCalled()
    })

    it('handles API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid API key'),
      })

      const callbacks: StreamCallbacks = {
        onContent: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn(),
      }

      const adapter = getProviderAdapter('openai')
      
      await expect(adapter.streamChat(messages, config, callbacks)).rejects.toThrow('API Error 401')
    })
  })

  describe('Anthropic adapter', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' }
    ]
    const config: ProviderConfig = {
      apiKey: 'test-anthropic-key',
      model: 'claude-3-opus-20240229',
    }

    it('sends correct headers for anthropic', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined })
      }
      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      })

      const callbacks: StreamCallbacks = {
        onContent: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn(),
      }

      const adapter = getProviderAdapter('anthropic')
      await adapter.streamChat(messages, config, callbacks)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'test-anthropic-key',
            'anthropic-version': '2023-06-01',
          }
        })
      )
    })

    it('handles anthropic content_block_delta events', async () => {
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n') 
          })
          .mockResolvedValueOnce({ done: true, value: undefined })
      }
      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      })

      const callbacks: StreamCallbacks = {
        onContent: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn(),
      }

      const adapter = getProviderAdapter('anthropic')
      await adapter.streamChat(messages, config, callbacks)

      expect(callbacks.onContent).toHaveBeenCalledWith('Hello')
      expect(callbacks.onDone).toHaveBeenCalled()
    })

    it('includes system prompt when provided', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined })
      }
      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      })

      const callbacks: StreamCallbacks = {
        onContent: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn(),
      }

      const configWithSystem: ProviderConfig = {
        ...config,
        systemPrompt: 'You are a helpful assistant.',
      }

      const adapter = getProviderAdapter('anthropic')
      await adapter.streamChat(messages, configWithSystem, callbacks)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.system).toBe('You are a helpful assistant.')
    })
  })
})
