import { describe, expect, it } from 'vitest'

import { projectFilesListColumnHeaders, projectFilesListSortOptions } from './files-list-column-header-model'

describe('files list column header model', () => {
  it('projects Files list sort columns outside the UI primitive', () => {
    expect(projectFilesListColumnHeaders()).toEqual([
      { id: 'name', label: '名称', className: 'flex-1 flex items-center gap-1 hover:text-foreground' },
    ])
    expect(projectFilesListSortOptions()).toEqual([
      { id: 'name', label: '名称' },
      { id: 'kind', label: '类别' },
      { id: 'mimeType', label: '类型' },
      { id: 'size', label: '大小' },
      { id: 'modifiedAt', label: '修改时间' },
    ])
  })
})
