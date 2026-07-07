import { describe, expect, it } from 'vitest'

import {
  canExpandFilesTreeNode,
  createContainerNodeId,
  getContainerLabel,
  parseTreeNodeId,
  projectFilesTreeChildrenState,
  projectFilesTreeChromeModel,
  projectFilesTreeContentState,
  projectFilesTreeHeaderDescription,
  projectFilesTreeNodeViewState,
} from './tree-model'

describe('Files tree model', () => {
  it('projects and parses tree node ids without Pod transport', () => {
    expect(createContainerNodeId('https://pod.example/public')).toBe('container:https://pod.example/public/')
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

  it('identifies tree nodes that can be expanded without UI state', () => {
    expect(canExpandFilesTreeNode({ id: 'all', label: 'All', type: 'all' })).toBe(false)
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
    expect(projectFilesTreeChromeModel()).toEqual({
      headerTitle: '资源范围',
      collapseRailLabel: '收起资源栏',
      expandRailLabel: '展开资源栏',
      treeLabel: '文件分组树',
      rootLoadingLabel: '正在加载容器…',
      rootErrorLabel: '读取容器失败。',
      childLoadingLabel: '正在读取子容器…',
    })
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

    expect(projectFilesTreeHeaderDescription({
      threadTitle: '代码审阅',
      workspaceUri: 'https://pod.example/ws/',
    })).toBe('当前话题：代码审阅')
    expect(projectFilesTreeHeaderDescription({
      threadTitle: null,
      workspaceUri: 'https://pod.example/ws/',
    })).toBe('当前话题：未命名话题')
    expect(projectFilesTreeHeaderDescription({
      threadTitle: '代码审阅',
      workspaceUri: null,
    })).toBe('浏览当前 Pod 容器；绑定目录后会在这里出现当前话题容器。')

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
})
