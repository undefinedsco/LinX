import { describe, expect, it } from 'vitest'

import {
  displayContainerLocation,
  displayResourceName,
  isInsidePodSystemContainer,
  isPodSystemContainer,
  shouldRequestEditableSheetForStructuredSubjectTarget,
} from './resource-semantics'

describe('Files resource semantics', () => {
  it('keeps structured RDF subject targets embedded instead of opening an editable sheet', () => {
    for (const uri of [
      'https://pod.example/.data/tasks.ttl#task-1',
      'https://pod.example/.data/tasks.jsonld',
      'https://pod.example/.data/tasks.rdf?version=2',
      'https://pod.example/.data/tasks.nt',
      'https://pod.example/.data/tasks.trig',
    ]) {
      expect(shouldRequestEditableSheetForStructuredSubjectTarget(uri), uri).toBe(false)
    }
  })

  it('requests the editable sheet for non-structured subject targets', () => {
    for (const uri of [
      'https://pod.example/docs/brief.md',
      'https://pod.example/docs/slides.pdf',
      'not a url.md',
      'mailto:team@example.com',
    ]) {
      expect(shouldRequestEditableSheetForStructuredSubjectTarget(uri), uri).toBe(true)
    }
  })

  it('marks only pod-root app containers as system containers', () => {
    const root = 'https://pod.example/alice/'
    for (const name of ['agents', 'profile', 'settings', 'inbox']) {
      expect(isPodSystemContainer(`${root}${name}/`, root), name).toBe(true)
    }
    for (const uri of [`${root}.data/`, `${root}notes/`, `${root}notes/settings/`, `${root}.data/agents/`, `${root}settings`]) {
      expect(isPodSystemContainer(uri, root), uri).toBe(false)
    }
  })

  it('shows documents, tables and cards without their extension', () => {
    expect(displayResourceName('会议纪要.md')).toBe('会议纪要')
    expect(displayResourceName('任务.ttl')).toBe('任务')
    expect(displayResourceName('报价.card.ttl')).toBe('报价')
    expect(displayResourceName('photo.png')).toBe('photo.png')
    expect(displayResourceName('.data')).toBe('数据')
  })

  it('describes where a resource lives in words, without encoding or scheme', () => {
    const root = 'https://pod.example/test/'
    expect(displayContainerLocation(root, root)).toBe('我的空间')
    expect(displayContainerLocation('https://pod.example/test/.data/', root)).toBe('我的空间 / 数据')
    expect(displayContainerLocation('https://pod.example/test/%E7%AC%94%E8%AE%B0/%E6%97%A5%E8%AE%B0/', root)).toBe('我的空间 / 笔记 / 日记')
  })

  it('recognises files inside Pod system containers', () => {
    const root = 'https://pod.example/'
    expect(isInsidePodSystemContainer('https://pod.example/agents/a/notes.md', root)).toBe(true)
    expect(isInsidePodSystemContainer('https://pod.example/notes/a.md', root)).toBe(false)
  })
})
