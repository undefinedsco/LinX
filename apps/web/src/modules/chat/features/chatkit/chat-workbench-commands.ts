import type { Command } from '@openai/chatkit-react'

interface BranchCommandState {
  index: number
  count: number
}

interface ChatWorkbenchCommandOptions {
  hasEditableMessage: boolean
  hasReadableAnswer: boolean
  isReading: boolean
  canOpenProjectContext: boolean
  attachmentCount: number
  canOpenResources: boolean
  canShare: boolean
  messageBranch?: BranchCommandState
  answerBranch?: BranchCommandState
}

export function createChatWorkbenchCommands(options: ChatWorkbenchCommandOptions): Command[] {
  const commands: Command[] = []

  appendBranchCommands(commands, 'message', '提问', options.messageBranch)
  appendBranchCommands(commands, 'answer', '回答', options.answerBranch)

  if (options.hasEditableMessage) commands.push({
    id: 'linx.edit-latest-message',
    label: '编辑最近提问',
    description: '编辑最后一条用户消息并创建新的对话分支',
    icon: 'write',
    group: '消息操作',
  })
  if (options.hasReadableAnswer) commands.push({
    id: 'linx.read-latest-answer',
    label: options.isReading ? '停止朗读回答' : '朗读最近回答',
    description: '朗读当前分支的最后一条回答',
    icon: 'play',
    group: '消息操作',
  })
  if (options.canOpenProjectContext) commands.push({
    id: 'linx.open-project-context',
    label: '项目上下文与记忆',
    description: '查看当前项目使用的说明、文件和记忆',
    icon: 'lucide:brain',
    group: '输入与上下文',
  })
  if (options.attachmentCount > 0) commands.push({
    id: 'linx.open-attachments',
    label: `查看会话附件（${options.attachmentCount}）`,
    description: '打开、下载或管理当前会话已经使用的附件',
    icon: 'lucide:paperclip',
    group: '输入与上下文',
  })
  commands.push({
    id: 'linx.open-capture',
    label: '拍照或共享画面',
    description: '把摄像头、屏幕或窗口画面添加到输入框',
    icon: 'lucide:camera',
    group: '输入与上下文',
  }, {
    id: 'linx.open-voice',
    label: '实时语音对话',
    description: '连续识别语音、发送消息并朗读回答',
    icon: 'lucide:audio-lines',
    group: '输入与上下文',
  })
  if (options.canOpenResources) commands.push({
    id: 'linx.open-artifacts',
    label: '查看会话产物',
    description: '打开当前会话生成的文件和历史版本',
    icon: 'document',
    group: '会话资源',
  }, {
    id: 'linx.open-assets',
    label: '从空间选择文件',
    description: '从当前 Pod 的聊天资产中选择并复用文件',
    icon: 'book-open',
    group: '会话资源',
  })
  if (options.canShare) commands.push({
    id: 'linx.open-share',
    label: '分享与导出',
    description: '分享当前会话，或导出 Markdown、PDF 等格式',
    icon: 'lucide:share-2',
    group: '会话资源',
  })

  return commands
}

function appendBranchCommands(
  commands: Command[],
  kind: 'message' | 'answer',
  label: '提问' | '回答',
  branch: BranchCommandState | undefined,
) {
  if (!branch || branch.count < 2) return
  const position = `${branch.index + 1}/${branch.count}`
  if (branch.index > 0) commands.push({
    id: `linx.previous-${kind}-branch`,
    label: `上一个${label}版本`,
    description: `当前${label}版本 ${position}`,
    icon: 'chevron-left',
    group: '消息版本',
  })
  if (branch.index < branch.count - 1) commands.push({
    id: `linx.next-${kind}-branch`,
    label: `下一个${label}版本`,
    description: `当前${label}版本 ${position}`,
    icon: 'chevron-right',
    group: '消息版本',
  })
}
