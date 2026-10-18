import { describe, expect, it } from 'vitest'
import { summarizeProgress } from './ProcessLine'

const steps = [
  { title: '读了志愿者名单（6 人）', status: 'done' as const },
  { title: '对比维护负担和上手成本', status: 'running' as const },
]

describe('process line', () => {
  it('says what it is doing and which step', () => {
    expect(summarizeProgress(steps, 'running')).toMatchObject({ headline: '对比维护负担和上手成本', detail: '第 2 步', tone: 'running' })
  })

  it('asks for a decision, folds when done', () => {
    expect(summarizeProgress(steps, 'waiting').headline).toBe('等你决定：对比维护负担和上手成本')
    expect(summarizeProgress([{ title: 'a', status: 'done' }, { title: 'b', status: 'done' }], 'done').headline).toBe('完成 · 2 步')
  })

  it('stopping is a request until the run really ends, then "已停止"', () => {
    expect(summarizeProgress(steps, 'running', { stopping: true })).toMatchObject({ headline: '正在停止…', detail: '已完成的步骤不会撤回' })
    expect(summarizeProgress(steps, 'running', { cancelled: true })).toMatchObject({ headline: '已停止', detail: '完成了 1 步' })
  })

  it('names the step that did not work', () => {
    expect(summarizeProgress([{ title: '读去年排班表', status: 'failed' }], 'failed').tone).toBe('failed')
  })
})
