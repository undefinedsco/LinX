import { describe, expect, it } from 'vitest'

import {
  projectStructuredProjectionWarningsAlert,
  projectStructuredShapeWarningsAlert,
  projectStructuredSourceUnavailableAlert,
} from './structured-projection-alerts-model'

describe('structured projection alerts model', () => {
  it('projects source unavailable copy for table and compact raw contexts', () => {
    expect(projectStructuredSourceUnavailableAlert({ compact: false })).toEqual({
      compact: false,
      message: '完整原始内容暂时不可用，不能解析结构化表。',
    })
    expect(projectStructuredSourceUnavailableAlert({ compact: true })).toEqual({
      compact: true,
      message: '完整原始内容暂时不可用。',
    })
  })

  it('projects shape warning availability, count, and first message', () => {
    expect(projectStructuredShapeWarningsAlert([])).toEqual({
      available: false,
      countLabel: '',
      message: '',
    })
    expect(projectStructuredShapeWarningsAlert([
      { message: '缺少必填 name' },
      { message: 'dateCreated 格式不正确' },
    ])).toEqual({
      available: true,
      countLabel: '2 个校验提醒',
      message: '缺少必填 name',
    })
  })

  it('projects projection warning availability and first message', () => {
    expect(projectStructuredProjectionWarningsAlert([])).toEqual({
      available: false,
      message: '',
    })
    expect(projectStructuredProjectionWarningsAlert([
      'RDF/XML preview requires browser XML support.',
      'Second warning',
    ])).toEqual({
      available: true,
      message: 'RDF/XML preview requires browser XML support.',
    })
  })
})
