import { describe, expect, it } from 'vitest'

import { projectStructuredProjectionRawViewChrome } from './structured-projection-raw-view-model'

describe('structured projection raw view model', () => {
  it('projects raw view heading and description chrome', () => {
    expect(projectStructuredProjectionRawViewChrome()).toEqual({
      description: '按当前筛选、显示的列和待确认修改得到的原始数据。',
      heading: '当前视图文本',
    })
  })
})
