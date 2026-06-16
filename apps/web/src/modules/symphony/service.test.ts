import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeCodexAppServerInteractionRequest } from '@linx/agent-runtime/auto-mode'
import { approvalResource, inboxNotificationResource, inputRequestResource, reportResource, runStepResource, sessionResource } from '@undefineds.co/models'
import {
  createAndPersistWebSymphonyWorkerGoalPlan,
  createWebSymphonyWorkerGoalPlan,
  persistWebSymphonyWorkerDelivery,
  persistWebSymphonyInteractionRequest,
  runAndPersistWebSymphonyWorkerGoal,
} from './service'


class FakeRuntimeEventSource {
  static instances: FakeRuntimeEventSource[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  close = vi.fn()

  constructor(public readonly url: string) {
    FakeRuntimeEventSource.instances.push(this)
  }

  emit(event: unknown) {
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

afterEach(() => {
  vi.unstubAllGlobals()
  FakeRuntimeEventSource.instances = []
})

describe('web Symphony worker goal service', () => {
  it('creates worker goal control records through the shared agent-runtime plan use-case', () => {
    const plan = createWebSymphonyWorkerGoalPlan({
      objective: 'verify Web-started worker visibility',
      acceptanceCriteria: ['Issue and Task are Pod-readable'],
      workspacePath: '/tmp/linx',
      workspaceKind: 'folder',
      backend: 'codex',
      chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
      thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-web',
      now: new Date('2026-04-01T06:00:00.000Z'),
      randomId: 'web-worker',
    })

    expect(plan.issue.source).toBe('web')
    expect(plan.issue.chat).toBe('https://alice.example/.data/chat/__secretary__/index.ttl#this')
    expect(plan.issue.thread).toBe('https://alice.example/.data/chat/__secretary__/index.ttl#thread-web')
    expect(plan.taskRecord.issue).toBe(plan.issue.uri)
    expect(plan.delivery.task).toBe(plan.task)
    expect(plan.session.delivery).toBe(plan.delivery.uri)
    expect(plan.delivery.projection.runtimeRole).toBe('user')
    expect(plan.delivery.projection.prompt).toContain('verify Web-started worker visibility')
  })

  it('persists Web-created worker control rows through the shared stores use-case', async () => {
    const calls: { op: string; resource: unknown; target?: unknown; value?: Record<string, unknown> }[] = []
    const fakeDb = {
      async init(resources: unknown[]) {
        calls.push({ op: 'init', resource: resources })
      },
      async findByResource(resource: unknown, target: unknown) {
        calls.push({ op: 'find', resource, target })
        return null
      },
      updateByResource() {
        throw new Error('expected insert path')
      },
      insert(resource: unknown) {
        return {
          values(value: Record<string, unknown>) {
            return {
              async execute() {
                calls.push({ op: 'insert', resource, value })
              },
            }
          },
        }
      },
    }

    const result = await createAndPersistWebSymphonyWorkerGoalPlan({
      db: fakeDb as never,
      webId: 'https://alice.example/profile/card#me',
      objective: 'verify Web-created worker status is visible to CLI',
      acceptanceCriteria: ['Session row has symphony-run metadata'],
      workspacePath: '/tmp/linx',
      workspaceKind: 'folder',
      backend: 'codex',
      chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
      thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-web',
      now: new Date('2026-04-01T06:00:00.000Z'),
      randomId: 'web-persist',
    })

    expect(result.plan.issue.source).toBe('web')
    expect(result.rows.sessions[0]?.tool).toBe('symphony:codex')
    expect(result.rows.sessions[0]?.metadata?.kind).toBe('symphony-run')
    expect(result.rows.sessions[0]?.metadata?.workers?.[0]?.status).toBe('planned')
    expect(calls.some((call) => call.op === 'insert' && call.resource === sessionResource)).toBe(true)
  })

  it('persists Web-observed Codex runtime requests through the shared stores use-case', async () => {
    const plan = createWebSymphonyWorkerGoalPlan({
      objective: 'verify Web runtime request persistence',
      workspacePath: '/tmp/linx',
      workspaceKind: 'folder',
      backend: 'codex',
      chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
      thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-web',
      now: new Date('2026-04-01T06:00:00.000Z'),
      randomId: 'web-request',
    })
    const request = normalizeCodexAppServerInteractionRequest({
      method: 'item/commandExecution/requestApproval',
      params: {
        command: 'pwd',
        cwd: '/tmp/linx',
      },
    })
    expect(request).toBeTruthy()

    const calls: { op: string; resource: unknown; target?: unknown; value?: Record<string, unknown> }[] = []
    const fakeDb = {
      async init(resources: unknown[]) {
        calls.push({ op: 'init', resource: resources })
      },
      async findByResource(resource: unknown, target: unknown) {
        calls.push({ op: 'find', resource, target })
        return null
      },
      updateByResource() {
        throw new Error('expected insert path')
      },
      insert(resource: unknown) {
        return {
          values(value: Record<string, unknown>) {
            return {
              async execute() {
                calls.push({ op: 'insert', resource, value })
              },
            }
          },
        }
      },
    }

    const result = await persistWebSymphonyInteractionRequest({
      db: fakeDb as never,
      webId: 'https://alice.example/profile/card#me',
      plan,
      request: request!,
      now: new Date('2026-04-01T06:01:00.000Z'),
      randomId: 'web-approval',
      source: 'codex-app-server',
    })

    expect(result.rows.approval?.toolName).toBe('commandExecution')
    const insertedResources = calls.filter((call) => call.op === 'insert').map((call) => call.resource)
    expect(insertedResources).toEqual([
      approvalResource,
      inboxNotificationResource,
      runStepResource,
    ])
    expect(calls.find((call) => call.op === 'insert' && call.resource === runStepResource)?.value?.stepType).toBe('approval.required')
  })

  it('runs a Web-started Codex worker through an injected runtime adapter and persists shared lifecycle rows', async () => {
    const calls: { op: string; resource: unknown; target?: unknown; value?: Record<string, unknown> }[] = []
    const fakeDb = {
      async init(resources: unknown[]) {
        calls.push({ op: 'init', resource: resources })
      },
      async findByResource(resource: unknown, target: unknown) {
        calls.push({ op: 'find', resource, target })
        return null
      },
      updateByResource() {
        throw new Error('expected insert path')
      },
      insert(resource: unknown) {
        return {
          values(value: Record<string, unknown>) {
            return {
              async execute() {
                calls.push({ op: 'insert', resource, value })
              },
            }
          },
        }
      },
    }
    const adapterCalls: Array<{ prompt: string; backend: string }> = []

    const result = await runAndPersistWebSymphonyWorkerGoal({
      db: fakeDb as never,
      webId: 'https://alice.example/profile/card#me',
      objective: 'run a Web-started Codex worker',
      acceptanceCriteria: ['runtime adapter receives projected prompt'],
      workspacePath: '/tmp/linx',
      backend: 'codex',
      chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
      thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-web',
      now: new Date('2026-04-01T06:10:00.000Z'),
      randomId: 'web-runtime',
      runtimeAdapter: {
        async run({ worker, prompt }) {
          adapterCalls.push({ prompt, backend: worker.session.backend })
          return {
            status: 'completed',
            exitCode: 0,
            autoModeSessionId: 'codex-web-session-1',
            reportText: [
              'Done.',
              '',
              '```json',
              JSON.stringify({
                symphonyFinal: true,
                summary: 'Web-started Codex worker completed.',
                evidence: ['fake Codex adapter emitted lifecycle event'],
              }),
              '```',
            ].join('\n'),
            events: [{
              stepType: 'run.step',
              message: 'fake Codex worker heartbeat',
              payload: { heartbeat: true },
              now: new Date('2026-04-01T06:10:30.000Z'),
              randomId: 'web-runtime-heartbeat',
            }],
          }
        },
      },
    })

    expect(result.status).toBe('completed')
    expect(result.autoModeSessionId).toBe('codex-web-session-1')
    expect(result.plan.issue.status).toBe('resolved')
    expect(adapterCalls).toHaveLength(1)
    expect(adapterCalls[0]?.backend).toBe('codex')
    expect(adapterCalls[0]?.prompt).toContain('run a Web-started Codex worker')

    const runStepValues = calls
      .filter((call) => call.op === 'insert' && call.resource === runStepResource)
      .map((call) => call.value?.stepType)
    expect(runStepValues).toContain('run.started')
    expect(runStepValues).toContain('run.step')
    expect(runStepValues).toContain('run.completed')
    expect(calls.some((call) => call.op === 'insert' && call.resource === sessionResource && call.value?.status === 'completed')).toBe(true)
  })


  it('default Web hosted runtime adapter persists runtime input requests through shared stores', async () => {
    const calls: { op: string; resource: unknown; target?: unknown; value?: Record<string, unknown> }[] = []
    const fakeDb = {
      async init(resources: unknown[]) {
        calls.push({ op: 'init', resource: resources })
      },
      async findByResource(resource: unknown, target: unknown) {
        calls.push({ op: 'find', resource, target })
        return null
      },
      updateByResource() {
        throw new Error('expected insert path')
      },
      insert(resource: unknown) {
        return {
          values(value: Record<string, unknown>) {
            return {
              async execute() {
                calls.push({ op: 'insert', resource, value })
              },
            }
          },
        }
      },
    }

    vi.stubGlobal('EventSource', FakeRuntimeEventSource)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/runtime/threads') {
        return jsonResponse({ id: 'runtime-default', status: 'idle', threadId: 'thread-web' })
      }
      if (url.pathname === '/api/runtime/threads/runtime-default/start') {
        return jsonResponse({ id: 'runtime-default', status: 'active', threadId: 'thread-web' })
      }
      if (url.pathname === '/api/runtime/threads/runtime-default/message') {
        queueMicrotask(() => {
          const source = FakeRuntimeEventSource.instances[0]!
          source.emit({
            type: 'auth_required',
            ts: Date.parse('2026-04-01T06:15:30.000Z'),
            threadId: 'runtime-default',
            method: 'browser',
            url: 'https://auth.example/',
            message: 'Codex needs browser authentication',
          })
          source.emit({
            type: 'assistant_done',
            ts: Date.parse('2026-04-01T06:16:00.000Z'),
            threadId: 'runtime-default',
            text: [
              'Done.',
              '',
              '```json',
              JSON.stringify({
                symphonyFinal: true,
                summary: 'Hosted runtime worker completed after input request.',
                evidence: ['runtime auth request was persisted'],
              }),
              '```',
            ].join('\n'),
          })
        })
        return jsonResponse({ id: 'runtime-default', status: 'active', threadId: 'thread-web' })
      }
      return jsonResponse({ error: 'unexpected' }, { status: 404 })
    }))

    const result = await runAndPersistWebSymphonyWorkerGoal({
      db: fakeDb as never,
      webId: 'https://alice.example/profile/card#me',
      objective: 'run Web hosted runtime with request persistence',
      acceptanceCriteria: ['runtime auth request becomes InputRequest'],
      workspacePath: '/tmp/linx',
      backend: 'codex',
      chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
      thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-web',
      now: new Date('2026-04-01T06:15:00.000Z'),
      randomId: 'web-runtime-default',
    })

    expect(result.status).toBe('completed')
    expect(calls.some((call) => call.op === 'insert' && call.resource === inputRequestResource)).toBe(true)
    expect(calls.some((call) => call.op === 'insert' && call.resource === inboxNotificationResource)).toBe(true)
    expect(calls.some((call) => call.op === 'insert' && call.resource === runStepResource && call.value?.stepType === 'input.required')).toBe(true)
  })

  it('persists Web-observed manual Codex Delivery through the shared stores ingress', async () => {
    const plan = createWebSymphonyWorkerGoalPlan({
      objective: 'ingest a Web-observed Codex Delivery',
      acceptanceCriteria: ['Delivery is normalized into shared Pod rows'],
      workspacePath: '/tmp/linx',
      backend: 'codex',
      chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
      thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-web',
      now: new Date('2026-04-01T06:20:00.000Z'),
      randomId: 'web-delivery',
    })
    const calls: { op: string; resource: unknown; target?: unknown; value?: Record<string, unknown> }[] = []
    const fakeDb = {
      async init(resources: unknown[]) {
        calls.push({ op: 'init', resource: resources })
      },
      async findByResource(resource: unknown, target: unknown) {
        calls.push({ op: 'find', resource, target })
        return null
      },
      updateByResource() {
        throw new Error('expected insert path')
      },
      insert(resource: unknown) {
        return {
          values(value: Record<string, unknown>) {
            return {
              async execute() {
                calls.push({ op: 'insert', resource, value })
              },
            }
          },
        }
      },
    }

    const result = await persistWebSymphonyWorkerDelivery({
      db: fakeDb as never,
      webId: 'https://alice.example/profile/card#me',
      plan,
      delivery: {
        symphonyDelivery: true,
        status: 'completed',
        exitCode: 0,
        report: {
          summary: 'Web-observed Codex Delivery completed.',
          evidence: ['manual Codex report was parsed'],
        },
      },
      now: new Date('2026-04-01T06:21:00.000Z'),
      randomId: 'web-delivery-ingest',
    })

    expect(result.status).toBe('completed')
    expect(result.plan.issue.status).toBe('resolved')
    expect(result.worker.runSteps?.map((step) => step.stepType)).toEqual(['run.started', 'run.completed'])
    expect(calls.some((call) => call.op === 'insert' && call.resource === reportResource && call.value?.summary === 'Web-observed Codex Delivery completed.')).toBe(true)
    expect(calls.some((call) => call.op === 'insert' && call.resource === runStepResource && call.value?.stepType === 'run.completed')).toBe(true)
  })

  it('rejects empty objective or workspace before creating durable control records', () => {
    expect(() => createWebSymphonyWorkerGoalPlan({
      objective: ' ',
      workspacePath: '/tmp/linx',
    })).toThrow(/目标/)

    expect(() => createWebSymphonyWorkerGoalPlan({
      objective: 'run worker',
      workspacePath: ' ',
    })).toThrow(/工作区/)
  })
})
