import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  isFolderUploadTextResource,
  projectFolderUploadBatchPlan,
  projectFolderUploadResourcePlan,
} from './domain/folder/folder-upload-model'

const folderUploadModelPath = 'src/modules/files/domain/folder/folder-upload-model.ts'

function uploadFile(overrides: { name?: string; type?: string; webkitRelativePath?: string } = {}) {
  return {
    name: overrides.name ?? 'notes.md',
    type: overrides.type ?? '',
    webkitRelativePath: overrides.webkitRelativePath,
  }
}

describe('folder upload model', () => {
  it('keeps folder upload planning in a pure domain model', () => {
    expect(existsSync(folderUploadModelPath)).toBe(true)
    if (!existsSync(folderUploadModelPath)) return

    const modelSource = readFileSync(folderUploadModelPath, 'utf8')

    expect(modelSource).toContain('export function isFolderUploadTextResource')
    expect(modelSource).toContain('export function projectFolderUploadResourcePlan')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useMemo')
    expect(modelSource).not.toContain('useToast')
    expect(modelSource).not.toContain('uploadedFile.text()')
  })

  it('preserves nested folder-picker paths as ordered container and resource plans', () => {
    expect(projectFolderUploadBatchPlan({
      uploadedFiles: [
        uploadFile({
          name: 'report.md',
          type: 'text/markdown',
          webkitRelativePath: 'Project/Docs/report.md',
        }),
        uploadFile({
          name: 'cover.png',
          type: 'image/png',
          webkitRelativePath: 'Project/cover.png',
        }),
      ],
      containerUri: 'https://pod.example/public/',
    })).toEqual({
      folders: [
        {
          containerUri: 'https://pod.example/public/',
          name: 'Project',
          uri: 'https://pod.example/public/Project/',
        },
        {
          containerUri: 'https://pod.example/public/Project/',
          name: 'Docs',
          uri: 'https://pod.example/public/Project/Docs/',
        },
      ],
      resources: [
        {
          contentKind: 'text',
          fileIndex: 0,
          fileName: 'report.md',
          resource: {
            mimeType: 'text/markdown',
            uri: 'https://pod.example/public/Project/Docs/report.md',
          },
        },
        {
          contentKind: 'blob',
          fileIndex: 1,
          fileName: 'cover.png',
          resource: {
            mimeType: 'image/png',
            uri: 'https://pod.example/public/Project/cover.png',
          },
        },
      ],
    })
  })

  it('projects sanitized upload target, mime fallback, and content kind', () => {
    expect(projectFolderUploadResourcePlan({
      uploadedFile: uploadFile({ name: 'fake/path/report.md', type: '' }),
      containerUri: 'https://pod.example/public/',
    })).toEqual({
      contentKind: 'text',
      fileName: 'report.md',
      resource: {
        mimeType: 'text/markdown',
        uri: 'https://pod.example/public/report.md',
      },
    })

    expect(projectFolderUploadResourcePlan({
      uploadedFile: uploadFile({ name: 'diagram.png', type: 'image/png' }),
      containerUri: 'https://pod.example/public/',
    })).toEqual({
      contentKind: 'blob',
      fileName: 'diagram.png',
      resource: {
        mimeType: 'image/png',
        uri: 'https://pod.example/public/diagram.png',
      },
    })

    expect(projectFolderUploadResourcePlan({
      uploadedFile: uploadFile({ name: '   ', type: '' }),
      containerUri: 'https://pod.example/public/',
    })).toBeNull()
  })

  it('classifies text uploads by mime type and known text extensions', () => {
    expect(isFolderUploadTextResource(uploadFile({ name: 'notes.txt', type: '' }))).toBe(true)
    expect(isFolderUploadTextResource(uploadFile({ name: 'graph.ttl', type: '' }))).toBe(true)
    expect(isFolderUploadTextResource(uploadFile({ name: 'data.json', type: '' }))).toBe(true)
    expect(isFolderUploadTextResource(uploadFile({ name: 'data.bin', type: 'application/json' }))).toBe(true)
    expect(isFolderUploadTextResource(uploadFile({ name: 'data.bin', type: 'application/ld+json' }))).toBe(true)
    expect(isFolderUploadTextResource(uploadFile({ name: 'data.bin', type: 'application/xml' }))).toBe(true)
    expect(isFolderUploadTextResource(uploadFile({ name: 'image.png', type: 'image/png' }))).toBe(false)
  })
})
