import { describe, expect, it } from 'vitest'
import { getFilesListErrorState } from './files-error-state'
import { FilesResourceReadError } from './resource-model'

describe('Files list error state', () => {
  it('turns bounded Pod timeouts into a retryable container message', () => {
    expect(getFilesListErrorState({ kind: 'timeout' })).toEqual({
      title: '读取容器超时',
      description: '当前空间响应较慢，可以重试或先切换到其它文件夹。',
    })
  })

  it('keeps permission failures distinct from transient failures', () => {
    expect(getFilesListErrorState(new FilesResourceReadError('https://pod.example/private/', { status: 403 }))).toEqual({
      title: '没有权限读取这个容器',
      description: '可以检查 ACL/ACR 权限，或切换到其它可浏览范围。',
    })
  })

  it('falls back to a generic message for unknown errors', () => {
    expect(getFilesListErrorState(new Error('unexpected'))).toEqual({
      title: '读取资源失败',
      description: '当前容器暂时不可用，请稍后重试。',
    })
  })
})
