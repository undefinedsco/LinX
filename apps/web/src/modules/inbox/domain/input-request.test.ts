import { describe, expect, it } from 'vitest'
import { formatInputSteerMessage, isPendingInputRequestStatus, isSecretInputRequest, parseInputRequestOptions } from './input-request'

describe('parseInputRequestOptions', () => {
  it('reads a JSON list of strings', () => {
    expect(parseInputRequestOptions('["13:00", "14:00"]')).toEqual([
      { value: '13:00', label: '13:00' },
      { value: '14:00', label: '14:00' },
    ])
  })

  it('reads label/value objects and an options wrapper', () => {
    expect(parseInputRequestOptions('{"options":[{"label":"下午两点","value":"14:00"}]}')).toEqual([
      { value: '14:00', label: '下午两点' },
    ])
  })

  it('falls back to one option per line', () => {
    expect(parseInputRequestOptions('- 共享日历\n- 排班小程序\n')).toEqual([
      { value: '共享日历', label: '共享日历' },
      { value: '排班小程序', label: '排班小程序' },
    ])
  })

  it('returns nothing for empty input', () => {
    expect(parseInputRequestOptions(null)).toEqual([])
    expect(parseInputRequestOptions('   ')).toEqual([])
  })
})

describe('input request kinds and status', () => {
  it('treats secret-like kinds as masked input', () => {
    expect(isSecretInputRequest('secret')).toBe(true)
    expect(isSecretInputRequest('calendar-password')).toBe(true)
    expect(isSecretInputRequest('user-input')).toBe(false)
  })

  it('only pending and handling requests can still be answered', () => {
    expect(isPendingInputRequestStatus('pending')).toBe(true)
    expect(isPendingInputRequestStatus('handling')).toBe(true)
    expect(isPendingInputRequestStatus('resolved')).toBe(false)
    expect(isPendingInputRequestStatus('expired')).toBe(false)
  })
})

describe('formatInputSteerMessage', () => {
  it('quotes the question so the run can match the answer', () => {
    expect(formatInputSteerMessage('周日下午几点开始？', ' 14:00 ')).toBe('回答「周日下午几点开始？」：14:00')
    expect(formatInputSteerMessage(null, '好')).toBe('好')
  })
})
