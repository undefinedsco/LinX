import { Brain, Camera, FileOutput, FolderOpen, Mic, Paperclip, Share2, Square, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ChatWorkbenchToolbarProps {
  showProjectContext: boolean
  attachmentCount: number
  artifactCount: number
  assetCount: number
  canOpenAssets: boolean
  canShare: boolean
  canReadAnswer: boolean
  isReading: boolean
  onOpenProjectContext: () => void
  onOpenAttachments: () => void
  onOpenCapture: () => void
  onOpenVoice: () => void
  onToggleReadAloud: () => void
  onOpenArtifacts: () => void
  onOpenAssets: () => void
  onOpenShare: () => void
}

export function ChatWorkbenchToolbar(props: ChatWorkbenchToolbarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex min-w-0 items-center justify-between gap-2">
      <div className="pointer-events-auto flex shrink-0 gap-2">
        {props.showProjectContext ? <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-full bg-background/95 px-3 shadow-sm backdrop-blur" onClick={props.onOpenProjectContext} aria-label="查看项目上下文与记忆"><Brain className="size-3.5" /><span className="hidden xl:inline">项目上下文</span></Button> : null}
        {props.attachmentCount > 0 ? <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-full bg-background/95 px-3 shadow-sm backdrop-blur" onClick={props.onOpenAttachments} aria-label={`查看会话附件，共 ${props.attachmentCount} 个`}><Paperclip className="size-3.5" /><span>附件 {props.attachmentCount}</span></Button> : null}
      </div>
      <div className="pointer-events-auto flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-background/80 p-0.5 backdrop-blur">
        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={props.onOpenCapture} aria-label="添加屏幕或摄像头画面"><Camera className="size-3.5" /><span className="hidden xl:inline">画面</span></Button>
        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={props.onOpenVoice} aria-label="打开实时语音对话"><Mic className="size-3.5" /><span className="hidden xl:inline">语音对话</span></Button>
        {props.canReadAnswer ? <Button type="button" variant={props.isReading ? 'secondary' : 'outline'} size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={props.onToggleReadAloud} aria-label={props.isReading ? '停止朗读回答' : '朗读最新回答'}>{props.isReading ? <Square className="size-3.5 fill-current" /> : <Volume2 className="size-3.5" />}<span className="hidden xl:inline">{props.isReading ? '停止朗读' : '朗读'}</span></Button> : null}
        {props.artifactCount > 0 ? <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={props.onOpenArtifacts} aria-label={`打开产物工作区，共 ${props.artifactCount} 个版本`}><FileOutput className="size-3.5" /><span className="hidden xl:inline">产物 {props.artifactCount}</span></Button> : null}
        {props.canOpenAssets ? <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={props.onOpenAssets} aria-label={`打开会话资产中心，共 ${props.assetCount} 个资产`}><FolderOpen className="size-3.5" /><span className="hidden xl:inline">资产 {props.assetCount}</span></Button> : null}
        {props.canShare ? <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-full bg-background/95 px-3" onClick={props.onOpenShare} aria-label="分享与导出当前会话"><Share2 className="size-3.5" /><span className="hidden xl:inline">分享与导出</span></Button> : null}
      </div>
    </div>
  )
}
