import { describe, expect, it } from 'vitest'

import {
  canExpandFilesTreeNode,
  createContainerNodeId,
  createResourceNodeId,
  getContainerLabel,
  getPodRootLabel,
  parseTreeNodeId,
  pinFavoriteTreeNodesFirst,
  projectFilesTreeChildrenState,
  projectFilesTreeChromeModel,
  projectFilesTreeContentState,
  projectFilesTreeFooterLabel,
  projectFilesTreeNodeViewState,
  projectFilesTreeSearchResults,
} from './tree-model'

describe('Files tree model', () => {
  it('projects and parses tree node ids without Pod transport', () => {
    expect(createContainerNodeId('https://pod.example/public')).toBe('container:https://pod.example/public/')
    expect(createResourceNodeId('https://pod.example/public/readme.md')).toBe('resource:https://pod.example/public/readme.md')
    expect(parseTreeNodeId('resource:https://pod.example/public/readme.md')).toEqual({
      kind: 'resource',
      uri: 'https://pod.example/public/readme.md',
    })
    expect(parseTreeNodeId('smart-root:recent')).toEqual({ kind: 'recent' })
    expect(parseTreeNodeId('smart-root:agents')).toEqual({ kind: 'agents-root' })
    expect(parseTreeNodeId('workspace:https://pod.example/ws/')).toEqual({
      kind: 'workspace',
      uri: 'https://pod.example/ws/',
    })
    expect(parseTreeNodeId(null)).toBeNull()
  })

  it('labels the Pod root and ordinary containers', () => {
    expect(getContainerLabel('https://pod.example/', 'https://pod.example/')).toBe('Pod 根目录')
    expect(getContainerLabel('https://pod.example/public/projects/')).toBe('projects')
  })

  it('labels an account-scoped Pod root with the account name', () => {
    expect(getContainerLabel(
      'https://id.undefineds.co/gcloud/',
      'https://id.undefineds.co/gcloud/',
    )).toBe("gcloud's Pod")
    expect(getPodRootLabel('https://id.undefineds.co/gcloud/')).toBe("gcloud's Pod")
    expect(getPodRootLabel('https://pod.example/')).toBe('Pod 根目录')
    expect(getPodRootLabel(null)).toBe('Pod 根目录')
  })

  it('projects a tree footer label only for selected root nodes with a known count', () => {
    const treeNodes = [
      { id: 'smart-root:all', label: '全部可浏览资源', type: 'all' as const, count: 6 },
      { id: 'container:https://pod.example/', label: 'Pod 根目录', type: 'container' as const, count: 6 },
      { id: 'smart-root:recent', label: '最近文件', type: 'recent' as const },
    ]

    expect(projectFilesTreeFooterLabel({
      selectedTreeNodeId: 'container:https://pod.example/',
      treeNodes,
    })).toBe('Pod 根目录 · 6 项')
    expect(projectFilesTreeFooterLabel({
      selectedTreeNodeId: 'smart-root:recent',
      treeNodes,
    })).toBeNull()
    expect(projectFilesTreeFooterLabel({
      selectedTreeNodeId: 'container:https://pod.example/nested/',
      treeNodes,
    })).toBeNull()
    expect(projectFilesTreeFooterLabel({ selectedTreeNodeId: null, treeNodes })).toBeNull()
  })

  it('identifies tree nodes that can be expanded without UI state', () => {
    expect(canExpandFilesTreeNode({ id: 'all', label: 'All', type: 'all' })).toBe(false)
    expect(canExpandFilesTreeNode({ id: 'resource:https://pod.example/readme.md', label: 'readme.md', type: 'resource' })).toBe(false)
    expect(canExpandFilesTreeNode({ id: 'smart-root:recent', label: 'Recent', type: 'recent' })).toBe(false)
    expect(canExpandFilesTreeNode({ id: 'pod-root', label: 'Pod 根目录', type: 'container' })).toBe(true)
    expect(canExpandFilesTreeNode({ id: 'smart-root:workspaces', label: 'Workspaces', type: 'workspaces-root' })).toBe(true)
    expect(canExpandFilesTreeNode({ id: 'workspace:https://pod.example/ws/', label: 'Workspace', type: 'workspace' })).toBe(true)
  })

  it('projects tree root content state without leaking query state into renderers', () => {
    const nodes = [{ id: 'all', label: 'All', type: 'all' }] as const

    expect(projectFilesTreeContentState({
      error: null,
      isLoading: true,
      treeNodes: [],
    })).toEqual({ kind: 'loading' })
    expect(projectFilesTreeContentState({
      error: new Error('network failed'),
      isLoading: false,
      treeNodes: [],
    })).toEqual({ kind: 'error' })
    expect(projectFilesTreeContentState({
      error: null,
      isLoading: false,
      treeNodes: [],
    })).toEqual({ kind: 'empty' })
    expect(projectFilesTreeContentState({
      error: null,
      isLoading: false,
      treeNodes: nodes,
    })).toEqual({ kind: 'content', treeNodes: nodes })
  })

  it('projects tree child content state without leaking child query state into renderers', () => {
    const childNodes = [{ id: 'pod-root', label: 'Pod 根目录', type: 'container' }] as const

    expect(projectFilesTreeChildrenState({
      childNodes: [],
      isLoading: true,
    })).toEqual({ kind: 'loading' })
    expect(projectFilesTreeChildrenState({
      childNodes,
      isLoading: false,
    })).toEqual({ kind: 'content', childNodes })
  })

  it('projects tree chrome outside the renderer', () => {
    const chrome = projectFilesTreeChromeModel()
    expect(chrome).toEqual({
      searchPlaceholder: '搜索文件树',
      clearSearchLabel: '清除搜索',
      emptySearchLabel: expect.any(Function),
      treeLabel: '文件分组树',
      rootLoadingLabel: '正在加载容器…',
      rootErrorLabel: '读取容器失败。',
      childLoadingLabel: '正在读取子容器…',
    })
    expect(chrome.emptySearchLabel('missing')).toBe('没有匹配“missing”的资源')
  })

  it('filters recursive entries by case-insensitive name for tree search', () => {
    const entries = [
      { id: 'https://pod.example/public/docs/', uri: 'https://pod.example/public/docs/', name: 'Docs', kind: 'container' },
      { id: 'https://pod.example/public/docs/report.md', uri: 'https://pod.example/public/docs/report.md', name: 'report.md', kind: 'resource' },
      { id: 'https://pod.example/public/notes.txt', uri: 'https://pod.example/public/notes.txt', name: 'notes.txt', kind: 'resource' },
    ] as const

    expect(projectFilesTreeSearchResults({ entries, query: '  ' })).toEqual([])
    expect(projectFilesTreeSearchResults({ entries, query: 'REPORT' }).map((entry) => entry.uri)).toEqual([
      'https://pod.example/public/docs/report.md',
    ])
    expect(projectFilesTreeSearchResults({ entries, query: 'docs' }).map((entry) => entry.uri)).toEqual([
      'https://pod.example/public/docs/',
    ])
  })

  it('projects header copy and node view state outside the controller', () => {
    const workspaceNode = {
      id: 'workspace:https://pod.example/ws/',
      label: 'Workspace',
      type: 'workspace',
    } as const
    const allNode = {
      id: 'all',
      label: 'All',
      type: 'all',
    } as const

    expect(projectFilesTreeNodeViewState({
      expandedTreeNodeIds: new Set([workspaceNode.id]),
      node: workspaceNode,
      rootLoading: true,
      selectedTreeNodeId: workspaceNode.id,
    })).toEqual({
      isSelected: true,
      isExpanded: true,
      canExpand: true,
      isLoading: true,
      toggleLabel: '收起 Workspace',
    })
    expect(projectFilesTreeNodeViewState({
      expandedTreeNodeIds: new Set(),
      node: allNode,
      rootLoading: true,
      selectedTreeNodeId: workspaceNode.id,
    })).toEqual({
      isSelected: false,
      isExpanded: false,
      canExpand: false,
      isLoading: false,
      toggleLabel: '展开 All',
    })
  })

  it('pins favorite child nodes first while preserving relative order', () => {
    const childNodes = [
      { id: 'container:https://pod.example/a/', label: 'a', type: 'container' as const, uri: 'https://pod.example/a/' },
      { id: 'resource:https://pod.example/b.md', label: 'b.md', type: 'resource' as const, uri: 'https://pod.example/b.md' },
      { id: 'resource:https://pod.example/c.md', label: 'c.md', type: 'resource' as const, uri: 'https://pod.example/c.md' },
    ]
    const favorites = [{ sourceId: 'https://pod.example/c.md' }]

    expect(pinFavoriteTreeNodesFirst(childNodes, favorites).map((node) => node.label)).toEqual(['c.md', 'a', 'b.md'])
    expect(pinFavoriteTreeNodesFirst(childNodes, []).map((node) => node.label)).toEqual(['a', 'b.md', 'c.md'])
    expect(pinFavoriteTreeNodesFirst(childNodes, [{ sourceId: 'https://pod.example/elsewhere.md' }]).map((node) => node.label)).toEqual(['a', 'b.md', 'c.md'])
  })
})
