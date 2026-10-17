import { createContext, useContext } from 'react'

/** Per-message composer switches (联网搜索 / 生成图片); they apply to the next message only. */
export interface ComposerTools {
  webSearch: boolean
  setWebSearch: (on: boolean) => void
  imageGeneration: boolean
  setImageGeneration: (on: boolean) => void
}

export const ComposerToolsContext = createContext<ComposerTools>({
  webSearch: false,
  setWebSearch: () => undefined,
  imageGeneration: false,
  setImageGeneration: () => undefined,
})

export function useComposerTools(): ComposerTools {
  return useContext(ComposerToolsContext)
}

/** The commands the `/` menu offers (the ChatKit set that still makes sense in a plain chat). */
export interface SlashCommand {
  id: 'generate-image' | 'web-search' | 'capture' | 'voice' | 'attachments' | 'artifacts' | 'assets' | 'share' | 'project-context'
  label: string
  keywords: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'generate-image', label: '生成图片', keywords: '图片 画 生成 image' },
  { id: 'web-search', label: '联网搜索', keywords: '搜索 联网 search' },
  { id: 'capture', label: '截图记录', keywords: '截图 拍照 摄像头 屏幕 capture' },
  { id: 'voice', label: '语音对话', keywords: '语音 说话 voice' },
  { id: 'attachments', label: '查看附件', keywords: '附件 文件 attachments' },
  { id: 'artifacts', label: '查看产物', keywords: '产物 成果 artifacts' },
  { id: 'assets', label: '从素材里选', keywords: '素材 文件 空间 assets' },
  { id: 'project-context', label: '项目记忆', keywords: '项目 记忆 上下文 memory' },
  { id: 'share', label: '分享这段聊天', keywords: '分享 导出 share' },
]
