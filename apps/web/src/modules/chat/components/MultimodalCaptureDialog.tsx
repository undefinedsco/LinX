import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, LoaderCircle, MonitorUp, Video, VideoOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type CaptureSource = 'screen' | 'camera'

export interface MultimodalCaptureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (file: File, source: CaptureSource) => Promise<void> | void
}

export function captureStreamFileName(source: CaptureSource, now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/gu, '-')
  return `${source === 'screen' ? 'screen' : 'camera'}-${timestamp}.png`
}

export async function captureVideoFrame(video: HTMLVideoElement, source: CaptureSource): Promise<File> {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) throw new Error('视频画面尚未准备好，请稍后重试。')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法截取视频画面。')
  context.drawImage(video, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('画面编码失败，请重试。')), 'image/png')
  })
  return new File([blob], captureStreamFileName(source), { type: 'image/png' })
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

export function MultimodalCaptureDialog({ open, onOpenChange, onCapture }: MultimodalCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestIdRef = useRef(0)
  const [source, setSource] = useState<CaptureSource | null>(null)
  const [starting, setStarting] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const closeStream = useCallback(() => {
    requestIdRef.current += 1
    stopStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setSource(null)
    setStarting(false)
  }, [])

  useEffect(() => {
    if (!open) closeStream()
    return closeStream
  }, [closeStream, open])

  const start = async (nextSource: CaptureSource) => {
    closeStream()
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setStarting(true)
    setError(null)
    try {
      const stream = nextSource === 'screen'
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        : await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      if (requestIdRef.current !== requestId) {
        stopStream(stream)
        return
      }
      streamRef.current = stream
      setSource(nextSource)
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', closeStream, { once: true })
    } catch (reason) {
      if (requestIdRef.current !== requestId) return
      const name = reason instanceof DOMException ? reason.name : ''
      setError(name === 'NotAllowedError'
        ? '未获得屏幕或摄像头权限。请在浏览器权限设置中允许后重试。'
        : reason instanceof Error ? reason.message : '无法打开屏幕或摄像头。')
    } finally {
      if (requestIdRef.current === requestId) setStarting(false)
    }
  }

  const capture = async () => {
    if (!source || !videoRef.current) return
    setCapturing(true)
    setError(null)
    try {
      const file = await captureVideoFrame(videoRef.current, source)
      await onCapture(file, source)
      closeStream()
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画面添加失败，请重试。')
    } finally {
      setCapturing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>添加屏幕或摄像头画面</DialogTitle>
          <DialogDescription>
            画面只在你点击“添加到输入框”后截取，并沿用当前会话的附件上传与 Pod 存储链路。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={source === 'screen' ? 'secondary' : 'outline'} disabled={starting || capturing} onClick={() => void start('screen')}>
            <MonitorUp className="mr-2 size-4" />共享屏幕
          </Button>
          <Button type="button" variant={source === 'camera' ? 'secondary' : 'outline'} disabled={starting || capturing} onClick={() => void start('camera')}>
            <Camera className="mr-2 size-4" />打开摄像头
          </Button>
          {source ? (
            <Button type="button" variant="ghost" disabled={capturing} onClick={closeStream}>
              <VideoOff className="mr-2 size-4" />停止预览
            </Button>
          ) : null}
        </div>
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border bg-black/90">
          {starting ? <div role="status" className="flex items-center gap-2 text-sm text-white/80"><LoaderCircle className="size-4 animate-spin" />正在请求权限…</div> : null}
          {!starting && !source ? <div className="flex flex-col items-center gap-2 text-sm text-white/60"><Video className="size-8" />选择屏幕或摄像头开始预览</div> : null}
          <video ref={videoRef} muted playsInline className={source ? 'size-full object-contain' : 'hidden'} aria-label="实时画面预览" />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" disabled={!source || capturing} onClick={() => void capture()}>
            {capturing ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Camera className="mr-2 size-4" />}
            添加到输入框
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
