import { FilesResourceReadError } from './resource-model'

export interface FilesErrorState {
  title: string
  description: string
}

export function getFilesListErrorState(error: unknown): FilesErrorState {
  if (error instanceof FilesResourceReadError) {
    switch (error.kind) {
      case 'unauthorized':
      case 'forbidden':
        return {
          title: '没有权限读取这个容器',
          description: '可以检查 ACL/ACR 权限，或切换到其它可浏览范围。',
        }
      case 'missing':
        return {
          title: '这个容器不存在',
          description: '资源可能已移动或删除，可以返回上级容器后刷新。',
        }
      case 'network':
        return {
          title: '网络连接中断',
          description: '请检查登录状态和网络连接，然后重试当前容器。',
        }
      case 'unknown':
        break
    }
  }

  return {
    title: '读取资源失败',
    description: '当前容器暂时不可用，请稍后重试。',
  }
}

export function getFilesDetailErrorState(error: unknown): FilesErrorState {
  if (error instanceof FilesResourceReadError) {
    switch (error.kind) {
      case 'unauthorized':
      case 'forbidden':
        return {
          title: '没有权限读取这个文件',
          description: '可以检查 ACL/ACR 权限，或从文件夹中选择其它文件。',
        }
      case 'missing':
        return {
          title: '这个文件不存在',
          description: '资源可能已移动或删除，可以返回文件夹后刷新。',
        }
      case 'network':
        return {
          title: '网络连接中断',
          description: '请检查登录状态和网络连接，然后重试这个文件。',
        }
      case 'unknown':
        break
    }
  }

  return {
    title: '读取文件失败',
    description: '当前文件暂时不可用，请稍后重试。',
  }
}
