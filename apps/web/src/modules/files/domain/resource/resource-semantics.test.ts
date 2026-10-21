import { describe, expect, it } from 'vitest'

import { isPodSystemContainer, shouldRequestEditableSheetForStructuredSubjectTarget } from './resource-semantics'

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
})
