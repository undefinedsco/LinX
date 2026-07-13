import { describe, expect, it } from 'vitest'
import { projectFilesAddContainerUri, projectFilesAddMenuModel } from './files-add-menu-model'

describe('Files add menu model', () => {
  it('keeps ambiguous destinations visible and disables writes', () => {
    const model = projectFilesAddMenuModel(null)

    expect(model.triggerLabel).toBe('添加')
    expect(model.destinationLabel).toBe('先选择一个文件夹')
    expect(model.actions.every((action) => action.disabled)).toBe(true)
  })

  it('offers document, folder, local upload, and web actions for a concrete folder', () => {
    const model = projectFilesAddMenuModel('https://pod.example/public/docs/')

    expect(model.destinationLabel).toBe('添加到 https://pod.example/public/docs/')
    expect(model.actions.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'create-document', label: '新建文档' },
      { id: 'create-folder', label: '新建文件夹' },
      { id: 'upload-files', label: '上传文件' },
      { id: 'upload-folder', label: '上传文件夹' },
      { id: 'add-web', label: '添加网页' },
    ])
  })

  it('writes only into a concrete selected container', () => {
    expect(projectFilesAddContainerUri({ kind: 'all' })).toBeNull()
    expect(projectFilesAddContainerUri({ kind: 'recent' })).toBeNull()
    expect(projectFilesAddContainerUri({
      kind: 'container',
      containerUri: 'https://pod.example/public/',
    })).toBe('https://pod.example/public/')
  })
})
