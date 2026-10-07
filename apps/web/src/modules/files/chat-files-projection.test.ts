import { describe, expect, it } from 'vitest'
import type { FilesEntry } from './domain/resource/resource-model'
import { mergeChatFileEntries, projectChatArtifactVersions, projectChatFileEntries } from './domain/list/chat-files-projection'

describe('chat files projection', () => {
  it('preserves chronological runtime artifact occurrences for the Chat artifact workspace', () => {
    const versions = projectChatArtifactVersions([
      {
        id: 'message-1',
        createdAt: '2026-06-18T10:00:00.000Z',
        richContent: JSON.stringify({ artifacts: [{ type: 'artifact', name: 'plan.md', resourceUri: 'https://pod.example/work/plan-v1.md', contentType: 'text/markdown' }] }),
      },
      {
        id: 'message-2',
        createdAt: '2026-06-18T11:00:00.000Z',
        richContent: JSON.stringify({ items: [{ type: 'tool', result: { artifacts: [{ type: 'artifact', name: 'plan.md', resourceUri: 'https://pod.example/work/plan-v2.md', contentType: 'text/markdown' }] } }] }),
      },
    ], 'https://pod.example/')

    expect(versions).toEqual([
      expect.objectContaining({ versionId: 'message-2:0', uri: 'https://pod.example/work/plan-v2.md' }),
      expect.objectContaining({ versionId: 'message-1:0', uri: 'https://pod.example/work/plan-v1.md' }),
    ])
  })
  it('projects file rich content items into files entries', () => {
    const entries = projectChatFileEntries([
      {
        id: 'message-1',
        createdAt: '2026-06-18T08:00:00.000Z',
        richContent: JSON.stringify({
          items: [
            {
              type: 'main_text',
              content: 'ready',
            },
            {
              type: 'file',
              fileName: 'Brief.md',
              fileUrl: 'https://pod.example/.data/workspaces/thread-1/Brief.md',
              fileSize: 42,
              mimeType: 'text/markdown',
            },
          ],
        }),
      },
    ], 'https://pod.example/')

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'https://pod.example/.data/workspaces/thread-1/Brief.md',
        uri: 'https://pod.example/.data/workspaces/thread-1/Brief.md',
        name: 'Brief.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/.data/workspaces/thread-1/',
        mimeType: 'text/markdown',
        size: 42,
        modifiedAt: '2026-06-18T08:00:00.000Z',
        sourceLabel: '聊天引用',
      }),
    ])
  })

  it('projects explicit chat file records that use resourceUri uri or url instead of fileUrl', () => {
    const entries = projectChatFileEntries([
      {
        id: 'message-resource-uri',
        createdAt: '2026-06-18T08:00:00.000Z',
        richContent: JSON.stringify({
          items: [
            {
              type: 'file',
              title: 'Resource URI file',
              resourceUri: 'https://pod.example/public/resource-uri.md',
              contentType: 'text/markdown',
            },
            {
              type: 'file',
              name: 'URI file',
              uri: 'https://pod.example/public/uri.md',
            },
            {
              type: 'file',
              fileName: 'URL file',
              url: 'https://pod.example/public/url.md',
            },
          ],
        }),
      },
    ], 'https://pod.example/')

    expect(entries.map((entry) => entry.uri)).toEqual([
      'https://pod.example/public/resource-uri.md',
      'https://pod.example/public/uri.md',
      'https://pod.example/public/url.md',
    ])
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Resource URI file',
        mimeType: 'text/markdown',
        sourceLabel: '聊天引用',
      }),
      expect.objectContaining({
        name: 'URI file',
        sourceLabel: '聊天引用',
      }),
      expect.objectContaining({
        name: 'URL file',
        sourceLabel: '聊天引用',
      }),
    ]))
  })

  it('deduplicates repeated chat file references by uri', () => {
    const richContent = JSON.stringify({
      items: [
        {
          type: 'file',
          fileName: 'Report.pdf',
          fileUrl: 'https://pod.example/public/Report.pdf',
          mimeType: 'application/pdf',
        },
      ],
    })

    const entries = projectChatFileEntries([
      { id: 'message-1', createdAt: '2026-06-18T08:00:00.000Z', richContent },
      { id: 'message-2', createdAt: '2026-06-18T09:00:00.000Z', richContent },
    ], 'https://pod.example/')

    expect(entries).toHaveLength(1)
    expect(entries[0]?.uri).toBe('https://pod.example/public/Report.pdf')
  })

  it('keeps the latest chat file reference timestamp when a file is mentioned again', () => {
    const fileUrl = 'https://pod.example/public/Report.pdf'

    const entries = projectChatFileEntries([
      {
        id: 'message-1',
        createdAt: '2026-06-18T08:00:00.000Z',
        richContent: JSON.stringify({
          items: [
            {
              type: 'file',
              fileName: 'Report.pdf',
              fileUrl,
              mimeType: 'application/pdf',
            },
          ],
        }),
      },
      {
        id: 'message-2',
        createdAt: '2026-06-18T09:00:00.000Z',
        richContent: JSON.stringify({
          items: [
            {
              type: 'file',
              fileName: 'Report.pdf',
              fileUrl,
              mimeType: 'application/pdf',
            },
          ],
        }),
      },
    ], 'https://pod.example/')

    expect(entries).toHaveLength(1)
    expect(entries[0]?.modifiedAt).toBe('2026-06-18T09:00:00.000Z')
  })

  it('projects runtime tool artifacts from rich content into files entries', () => {
    const entries = projectChatFileEntries([
      {
        id: 'message-runtime',
        createdAt: '2026-06-18T10:00:00.000Z',
        richContent: JSON.stringify({
          items: [
            {
              type: 'tool',
              toolName: 'create_file',
              result: {
                artifacts: [
                  {
                    type: 'artifact',
                    name: 'summary.md',
                    resourceUri: 'https://pod.example/.data/workspaces/thread-1/summary.md',
                    contentType: 'text/markdown',
                    size: 128,
                  },
                ],
                sourceUri: 'https://example.com/not-a-generated-file',
              },
            },
            {
              type: 'tool',
              toolName: 'batch_write',
              result: {
                files: [
                  {
                    fileUrl: 'https://pod.example/.data/workspaces/thread-1/diagram.svg',
                    fileName: 'diagram.svg',
                    mimeType: 'image/svg+xml',
                  },
                ],
              },
            },
          ],
        }),
      },
    ], 'https://pod.example/')

    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uri: 'https://pod.example/.data/workspaces/thread-1/summary.md',
        name: 'summary.md',
        mimeType: 'text/markdown',
        size: 128,
        sourceLabel: '运行产物',
      }),
      expect.objectContaining({
        uri: 'https://pod.example/.data/workspaces/thread-1/diagram.svg',
        name: 'diagram.svg',
        mimeType: 'image/svg+xml',
        sourceLabel: '运行产物',
      }),
    ]))
    expect(entries.map((entry) => entry.uri)).not.toContain('https://example.com/not-a-generated-file')
  })

  it('projects top-level runtime artifact containers from rich content envelopes', () => {
    const entries = projectChatFileEntries([
      {
        id: 'message-runtime-envelope',
        createdAt: '2026-06-18T10:30:00.000Z',
        richContent: JSON.stringify({
          artifacts: [
            {
              type: 'artifact',
              name: 'generated.md',
              resourceUri: 'https://pod.example/.data/workspaces/thread-1/generated.md',
              contentType: 'text/markdown',
            },
          ],
        }),
      },
    ], 'https://pod.example/')

    expect(entries).toEqual([
      expect.objectContaining({
        uri: 'https://pod.example/.data/workspaces/thread-1/generated.md',
        name: 'generated.md',
        mimeType: 'text/markdown',
        sourceLabel: '运行产物',
      }),
    ])
  })

  it('does not treat arbitrary citation urls as chat files', () => {
    const entries = projectChatFileEntries([
      {
        id: 'message-citation',
        createdAt: '2026-06-18T10:00:00.000Z',
        richContent: JSON.stringify({
          items: [
            {
              type: 'citation',
              webSearch: {
                results: [
                  { title: 'Docs', url: 'https://example.com/docs' },
                ],
              },
            },
          ],
        }),
      },
    ], 'https://pod.example/')

    expect(entries).toEqual([])
  })

  it('does not infer files from text, logs, tool names, or local paths without file records', () => {
    const entries = projectChatFileEntries([
      {
        id: 'message-log',
        createdAt: '2026-06-18T10:00:00.000Z',
        richContent: JSON.stringify({
          items: [
            {
              type: 'main_text',
              content: 'Wrote https://pod.example/.data/workspaces/thread-1/guessed.md',
              resourceUri: 'https://pod.example/.data/workspaces/thread-1/not-a-file-record.md',
            },
            {
              type: 'tool',
              toolName: 'write https://pod.example/.data/workspaces/thread-1/tool-name.md',
              result: {
                stdout: 'saved https://pod.example/.data/workspaces/thread-1/stdout.md',
                stderr: '/Users/ganlu/develop/linx-files/apps/web/src/modules/files/stdout.md',
                localPath: '/Users/ganlu/develop/linx-files/apps/web/src/modules/files/local.md',
                resourceUri: 'https://pod.example/.data/workspaces/thread-1/result-resource-uri.md',
              },
            },
          ],
        }),
      },
    ], 'https://pod.example/')

    expect(entries).toEqual([])
  })

  it('ignores file rich content and runtime artifacts outside the current Pod root', () => {
    const entries = projectChatFileEntries([
      {
        id: 'message-external-file',
        createdAt: '2026-06-18T10:00:00.000Z',
        richContent: JSON.stringify({
          items: [
            {
              type: 'file',
              fileName: 'external.md',
              fileUrl: 'https://example.com/external.md',
              mimeType: 'text/markdown',
            },
            {
              type: 'tool',
              result: {
                artifacts: [
                  {
                    type: 'artifact',
                    name: 'cross-pod.md',
                    resourceUri: 'https://other-pod.example/.data/workspaces/thread-1/cross-pod.md',
                  },
                  {
                    type: 'artifact',
                    name: 'local.md',
                    resourceUri: 'https://pod.example/.data/workspaces/thread-1/local.md',
                  },
                ],
              },
            },
          ],
        }),
      },
    ], 'https://pod.example/')

    expect(entries.map((entry) => entry.uri)).toEqual([
      'https://pod.example/.data/workspaces/thread-1/local.md',
    ])
  })

  it('does not accept a sibling account path that only shares the Pod path prefix', () => {
    const entries = projectChatArtifactVersions([{
      id: 'message-prefix-confusion',
      createdAt: '2026-06-18T10:00:00.000Z',
      richContent: JSON.stringify({
        artifacts: [
          { type: 'artifact', resourceUri: 'https://pod.example/alice-private/report.md', name: 'foreign.md' },
          { type: 'artifact', resourceUri: 'https://pod.example/alice/work/report.md', name: 'owned.md' },
        ],
      }),
    }], 'https://pod.example/alice/')

    expect(entries.map((entry) => entry.name)).toEqual(['owned.md'])
  })

  it('keeps workspace metadata when chat entries refer to an existing resource', () => {
    const workspaceEntry: FilesEntry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 100,
      modifiedAt: '2026-06-18T09:00:00.000Z',
      tags: ['workspace'],
    }
    const chatEntry: FilesEntry = {
      ...workspaceEntry,
      size: 10,
      modifiedAt: '2026-06-18T08:00:00.000Z',
      sourceLabel: '聊天引用',
    }

    expect(mergeChatFileEntries([chatEntry], [workspaceEntry])).toEqual([
      {
        ...workspaceEntry,
        sourceLabel: '聊天引用',
        tags: ['workspace'],
      },
    ])
  })

  it('orders chat and runtime files before workspace-only files without leaking proxy entries or label tags', () => {
    const workspaceEntries: FilesEntry[] = [
      {
        id: 'https://pod.example/public/favorite.md',
        uri: 'https://pod.example/public/favorite.md',
        name: 'favorite.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: 10,
        modifiedAt: '2026-06-18T11:00:00.000Z',
        sourceLabel: '收藏',
        tags: ['favorite'],
      },
      {
        id: 'https://pod.example/.data/workspaces/thread-1/runtime.md',
        uri: 'https://pod.example/.data/workspaces/thread-1/runtime.md',
        name: 'runtime.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/.data/workspaces/thread-1/',
        mimeType: 'text/markdown',
        size: 100,
        modifiedAt: '2026-06-18T08:00:00.000Z',
        sourceLabel: '当前话题',
        tags: ['workspace'],
      },
      {
        id: 'local-proxy:https://pod.example/.data/workspaces/thread-1/proxy.md',
        uri: 'local-proxy:https://pod.example/.data/workspaces/thread-1/proxy.md',
        name: 'proxy.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'local-proxy:https://pod.example/.data/workspaces/thread-1/',
        mimeType: 'text/markdown',
        size: 1,
        modifiedAt: '2026-06-18T12:00:00.000Z',
        sourceLabel: '本地代理',
      },
      {
        id: 'https://pod.example/public/recent.md',
        uri: 'https://pod.example/public/recent.md',
        name: 'recent.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: 20,
        modifiedAt: '2026-06-18T10:00:00.000Z',
        sourceLabel: '最近',
      },
    ]
    const chatEntries: FilesEntry[] = [
      {
        id: 'https://pod.example/.data/workspaces/thread-1/runtime.md',
        uri: 'https://pod.example/.data/workspaces/thread-1/runtime.md',
        name: 'runtime.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/.data/workspaces/thread-1/',
        mimeType: 'text/markdown',
        size: 50,
        modifiedAt: '2026-06-18T09:00:00.000Z',
        sourceLabel: '运行产物',
      },
      {
        id: 'https://pod.example/public/chat.md',
        uri: 'https://pod.example/public/chat.md',
        name: 'chat.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: 30,
        modifiedAt: '2026-06-18T09:30:00.000Z',
        sourceLabel: '聊天引用',
      },
    ]

    const merged = mergeChatFileEntries(chatEntries, workspaceEntries)

    expect(merged.map((entry) => entry.uri)).toEqual([
      'https://pod.example/.data/workspaces/thread-1/runtime.md',
      'https://pod.example/public/chat.md',
      'https://pod.example/public/favorite.md',
      'https://pod.example/public/recent.md',
    ])
    expect(merged[0]).toEqual(expect.objectContaining({
      size: 100,
      tags: ['workspace'],
      sourceLabel: '运行产物',
    }))
    expect(merged.flatMap((entry) => entry.tags ?? [])).toEqual(['workspace', 'favorite'])
    expect(merged.map((entry) => entry.sourceLabel)).toEqual([
      '运行产物',
      '聊天引用',
      '收藏',
      '最近',
    ])
  })
})
