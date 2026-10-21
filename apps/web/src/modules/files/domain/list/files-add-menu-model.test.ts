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
      { id: 'create-table', label: '新建表格' },
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

  it('falls back to the Pod root as a container, also for a path-based Pod', () => {
    // The Pod base has no trailing slash; without one, new URL('a.md', base) lands on the server origin.
    const target = projectFilesAddContainerUri({ kind: 'all' }, 'http://localhost:3000/test')
    expect(target).toBe('http://localhost:3000/test/')
    expect(new URL('会议纪要.md', target!).toString()).toBe(`http://localhost:3000/test/${encodeURIComponent('会议纪要.md')}`)
    expect(projectFilesAddContainerUri({ kind: 'all' }, 'http://localhost:3000/test/')).toBe('http://localhost:3000/test/')
    expect(projectFilesAddContainerUri({ kind: 'container', containerUri: 'http://localhost:3000/test/work/' }, 'http://localhost:3000/test'))
      .toBe('http://localhost:3000/test/work/')
  })
})
