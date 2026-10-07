import { describe, expect, it } from 'vitest'

import { projectStructuredProjectionRawViewChrome } from './structured-projection-raw-view-model'

describe('structured projection raw view model', () => {
  it('projects raw view heading and description chrome', () => {
    expect(projectStructuredProjectionRawViewChrome()).toEqual({
      description: '当前筛选、predicate 可见性和待确认更改后的投影视图。',
      heading: '当前视图文本',
    })
  })
})
