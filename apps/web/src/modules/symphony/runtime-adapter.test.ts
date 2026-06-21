import { describe, expect, it, vi } from 'vitest'
import { createWebSymphonyWorkerGoalPlan } from './service'
import {
  buildRuntimeSessionInput,
  createServiceRuntimeSymphonyAdapter,
  mapRuntimeSessionEventToSymphonyEvent,
} from './runtime-adapter'

type RuntimeEvent = Parameters<typeof mapRuntimeSessionEventToSymphonyEvent>[0]

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  close = vi.fn()

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  emit(event: RuntimeEvent) {
    this.onmessage?.({ data: JSON.stringify(event) })
  }
}

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function createPlan(overrides: Partial<Parameters<typeof createWebSymphonyWorkerGoalPlan>[0]> = {}) {
  return createWebSymphonyWorkerGoalPlan({
    objective: 'Run worker through hosted runtime',
    acceptanceCriteria: ['adapter emits normalized Symphony runtime events'],
    workspacePath: '/tmp/linx',
    workspaceKind: 'folder',
    backend: 'codex',
    chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
    thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-web',
    now: new Date('2026-04-01T06:30:00.000Z'),
    randomId: 'web-live-runtime',
    ...overrides,
  })
}

describe('service runtime Symphony adapter', () => {
  it('maps Symphony folder, worktree, and Pod container workspaces to hosted runtime sessions', () => {
    const folderPlan = createPlan()
    expect(buildRuntimeSessionInput(folderPlan.workers[0]!)).toMatchObject({
      threadId: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-web',
      title: 'Run worker through hosted runtime',
      workspaceKind: 'local-folder',
      repoPath: '/tmp/linx',
      folderPath: '/tmp/linx',
      runnerType: 'xpod-pty',
      tool: 'codex',
    })

    const worktreePlan = createPlan({
      workspaceKind: 'worktree',
      workspacePath: '/repo/linx',
      worktree: '/repo/.worktrees/linx-worker',
      branch: 'feature/symphony',
      baseRevision: 'main',
    })
    expect(buildRuntimeSessionInput(worktreePlan.workers[0]!)).toMatchObject({
      workspaceKind: 'local-worktree',
      repoPath: '/repo/linx',
      folderPath: '/repo/.worktrees/linx-worker',
      branch: 'feature/symphony',
      baseRef: 'main',
    })

    const podPlan = createPlan({
      workspacePath: 'https://node-0000.undefineds.co/.data/workspaces/thread-web/',
      container: 'https://node-0000.undefineds.co/.data/workspaces/thread-web/',
    })
    expect(buildRuntimeSessionInput(podPlan.workers[0]!)).toMatchObject({
      workspaceKind: 'pod-container',
      container: 'https://node-0000.undefineds.co/.data/workspaces/thread-web/',
    })
  })



  it('uses the same hosted runtime contract for a non-Codex backend', () => {
    const plan = createPlan({ backend: 'claude' })

    expect(buildRuntimeSessionInput(plan.workers[0]!)).toMatchObject({
      workspaceKind: 'local-folder',
      runnerType: 'xpod-pty',
      tool: 'claude',
    })

    const mapped = mapRuntimeSessionEventToSymphonyEvent({
      type: 'assistant_done',
      ts: Date.parse('2026-04-01T06:32:00.000Z'),
      threadId: 'runtime-claude',
      text: 'Claude worker report',
    })

    expect(mapped).toMatchObject({
      stepType: 'delivery.submitted',
      message: 'Runtime submitted a final assistant report.',
      payload: {
        source: 'web-service-runtime',
        runtimeEventType: 'assistant_done',
        runtimeThreadId: 'runtime-claude',
        text: 'Claude worker report',
      },
    })
  })

  it('runs a Web-started Codex worker through service runtime endpoints and normalizes events', async () => {
    FakeEventSource.instances = []
    const calls: Array<{ path: string; body?: unknown }> = []
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ path: url.pathname, body })

      if (url.pathname === '/api/runtime/threads' && init?.method === 'POST') {
        return jsonResponse({ id: 'runtime-1', status: 'idle', threadId: body.threadId })
      }
      if (url.pathname === '/api/runtime/threads/runtime-1/start') {
        return jsonResponse({ id: 'runtime-1', status: 'active', threadId: 'thread-web' })
      }
      if (url.pathname === '/api/runtime/threads/runtime-1/message') {
        queueMicrotask(() => {
          const source = FakeEventSource.instances[0]!
          source.emit({ type: 'meta', ts: Date.parse('2026-04-01T06:30:01.000Z'), threadId: 'runtime-1', runner: 'codex', workdir: '/tmp/linx' })
          source.emit({ type: 'assistant_delta', ts: Date.parse('2026-04-01T06:30:02.000Z'), threadId: 'runtime-1', text: 'Done' })
          source.emit({ type: 'assistant_done', ts: Date.parse('2026-04-01T06:30:03.000Z'), threadId: 'runtime-1', text: 'Done' })
        })
        return jsonResponse({ id: 'runtime-1', status: 'active', threadId: 'thread-web' })
      }
      return jsonResponse({ error: 'unexpected' }, { status: 404 })
    })

    const plan = createPlan()
    const adapter = createServiceRuntimeSymphonyAdapter({
      fetch,
      EventSource: FakeEventSource,
      baseUrl: 'http://localhost:5737',
      timeoutMs: 1000,
    })

    const result = await adapter.run({
      plan,
      worker: plan.workers[0]!,
      prompt: plan.workers[0]!.delivery.projection.prompt,
    })

    expect(result).toMatchObject({
      status: 'completed',
      exitCode: 0,
      autoModeSessionId: 'runtime-1',
      reportText: 'Done',
    })
    expect(result.events?.map((event) => event.stepType)).toEqual([
      'session.started',
      'run.step',
      'delivery.submitted',
    ])
    expect(calls.map((call) => call.path)).toEqual([
      '/api/runtime/threads',
      '/api/runtime/threads/runtime-1/start',
      '/api/runtime/threads/runtime-1/message',
    ])
    expect(calls[2]?.body).toEqual({ text: plan.workers[0]!.delivery.projection.prompt })
    expect(FakeEventSource.instances[0]?.url).toBe('http://localhost:5737/api/runtime/threads/runtime-1/events')
    expect(FakeEventSource.instances[0]?.close).toHaveBeenCalledTimes(1)
  })



  it('routes hosted runtime tool/input requests through the shared interaction callback before completion', async () => {
    FakeEventSource.instances = []
    const requests: unknown[] = []
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/api/runtime/threads') {
        return jsonResponse({ id: 'runtime-request', status: 'idle' })
      }
      if (url.pathname === '/api/runtime/threads/runtime-request/start') {
        return jsonResponse({ id: 'runtime-request', status: 'active' })
      }
      if (url.pathname === '/api/runtime/threads/runtime-request/message') {
        queueMicrotask(() => {
          const source = FakeEventSource.instances[0]!
          source.emit({
            type: 'tool_call',
            ts: Date.parse('2026-04-01T06:33:00.000Z'),
            threadId: 'runtime-request',
            requestId: 'tool-1',
            name: 'shell',
            arguments: '{"cmd":"pwd"}',
          })
          source.emit({
            type: 'assistant_done',
            ts: Date.parse('2026-04-01T06:33:01.000Z'),
            threadId: 'runtime-request',
            text: 'Done after tool request',
          })
        })
        return jsonResponse({ id: 'runtime-request', status: 'active' })
      }
      return jsonResponse({}, { status: 404 })
    })

    const plan = createPlan()
    const result = await createServiceRuntimeSymphonyAdapter({
      fetch,
      EventSource: FakeEventSource,
      baseUrl: 'http://localhost:5737',
      timeoutMs: 1000,
      async onInteractionRequest({ request, event }) {
        await Promise.resolve()
        requests.push({ request, event })
      },
    }).run({
      plan,
      worker: plan.workers[0]!,
      prompt: 'run with tool request',
    })

    expect(result.status).toBe('completed')
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      request: {
        kind: 'user-input',
        message: 'Runtime requested tool result for shell.',
      },
      event: {
        type: 'tool_call',
        requestId: 'tool-1',
      },
    })
    expect(result.events?.map((event) => event.stepType)).toEqual(['run.step', 'delivery.submitted'])
  })

  it('returns a failed runtime result when the hosted runtime reports an error', async () => {
    FakeEventSource.instances = []
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname === '/api/runtime/threads') {
        return jsonResponse({ id: 'runtime-error', status: 'idle' })
      }
      if (url.pathname === '/api/runtime/threads/runtime-error/start') {
        return jsonResponse({ id: 'runtime-error', status: 'active' })
      }
      if (url.pathname === '/api/runtime/threads/runtime-error/message') {
        queueMicrotask(() => FakeEventSource.instances[0]!.emit({
          type: 'error',
          ts: Date.parse('2026-04-01T06:31:00.000Z'),
          threadId: 'runtime-error',
          message: 'Codex runtime failed',
        }))
        return jsonResponse({ id: 'runtime-error', status: 'active' })
      }
      return jsonResponse({}, { status: 404 })
    })

    const plan = createPlan()
    const result = await createServiceRuntimeSymphonyAdapter({
      fetch,
      EventSource: FakeEventSource,
      baseUrl: 'http://localhost:5737',
      timeoutMs: 1000,
    }).run({
      plan,
      worker: plan.workers[0]!,
      prompt: 'fail now',
    })

    expect(result.status).toBe('failed')
    expect(result.exitCode).toBe(1)
    expect(result.reportText).toBe('Codex runtime failed')
    expect(result.events?.map((event) => event.stepType)).toEqual(['run.failed'])
  })
})
