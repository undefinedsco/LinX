import { describe, expect, it } from 'vitest'

import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  projectStructuredResourcePreviewSource,
  projectStructuredResourcePreviewVocabDefinitionIndex,
  projectStructuredResourcePreviewVocabUris,
} from './structured-resource-preview-model'

const documentUri = 'https://pod.example/.data/tasks.ttl'

function detail(overrides: Partial<FilesDetail> = {}): FilesDetail {
  return {
    id: overrides.uri ?? documentUri,
    uri: overrides.uri ?? documentUri,
    name: 'tasks.ttl',
    kind: 'resource',
    semanticKind: 'structured-data',
    parentUri: 'https://pod.example/.data/',
    mimeType: 'text/turtle',
    size: 80,
    modifiedAt: '2026-06-30T00:00:00.000Z',
    headers: {},
    previewText: '<#preview> a <#Task> .',
    ...overrides,
  }
}

describe('structured-resource-preview-model', () => {
  it('projects structured source from raw resource data, raw errors, and file preview fallback', () => {
    expect(projectStructuredResourcePreviewSource({
      file: detail(),
      rawResource: {
        data: {
          uri: documentUri,
          content: '<#raw> a <#Task> .',
        },
        error: null,
      },
    })).toBe('<#raw> a <#Task> .')

    expect(projectStructuredResourcePreviewSource({
      file: detail(),
      rawResource: {
        data: null,
        error: new Error('not readable'),
      },
    })).toBeNull()

    expect(projectStructuredResourcePreviewSource({
      file: detail(),
      rawResource: {
        data: {
          uri: 'https://pod.example/.data/other.ttl',
          content: '<#other> a <#Task> .',
        },
        error: null,
      },
    })).toBe('<#preview> a <#Task> .')
  })

  it('projects fallback and discovered vocab registry URIs', () => {
    expect(projectStructuredResourcePreviewVocabUris({
      currentPodRootUri: 'https://pod.example/',
      documentUri,
      vocabDiscovery: null,
    })).toEqual({
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
      vocabTermsUri: 'https://pod.example/.vocab/terms.ttl',
      vocabShapesUri: 'https://pod.example/.vocab/shapes.ttl',
      vocabNamespacesUri: 'https://pod.example/.vocab/namespaces.ttl',
    })

    expect(projectStructuredResourcePreviewVocabUris({
      currentPodRootUri: 'https://pod.example/',
      documentUri,
      vocabDiscovery: {
        private: [{ instance: 'https://pod.example/custom/vocab/terms.ttl', instanceContainer: null }],
        public: [],
      },
    })).toEqual({
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
      vocabTermsUri: 'https://pod.example/custom/vocab/terms.ttl',
      vocabShapesUri: 'https://pod.example/custom/vocab/shapes.ttl',
      vocabNamespacesUri: 'https://pod.example/custom/vocab/namespaces.ttl',
    })
  })

  it('projects vocab registry documents into a definition index', () => {
    const index = projectStructuredResourcePreviewVocabDefinitionIndex({
      terms: {
        uri: 'https://pod.example/.vocab/terms.ttl',
        mimeType: 'text/turtle',
        content: `
          @prefix udfs: <https://undefineds.co/vocab/> .
          @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
          <#status> a udfs:PredicateTerm ;
            rdfs:label "status" ;
            udfs:valueType "enum" .
        `,
      },
      shapes: {
        uri: 'https://pod.example/.vocab/shapes.ttl',
        mimeType: 'text/turtle',
        content: '',
      },
      namespaces: {
        uri: 'https://pod.example/.vocab/namespaces.ttl',
        mimeType: 'text/turtle',
        content: '',
      },
    })

    expect(index.predicates.get('#status')?.valueType).toBe('enum')
  })
})
