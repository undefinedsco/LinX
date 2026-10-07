import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MultimodalCaptureDialog, captureStreamFileName, captureVideoFrame } from './MultimodalCaptureDialog'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MultimodalCaptureDialog', () => {
  it('uses stable source-aware PNG names', () => {
    const now = new Date('2026-08-11T01:02:03.456Z')
    expect(captureStreamFileName('screen', now)).toBe('screen-2026-08-11T01-02-03-456Z.png')
    expect(captureStreamFileName('camera', now)).toBe('camera-2026-08-11T01-02-03-456Z.png')
  })

  it('captures the current video frame as a PNG file', async () => {
    const video = document.createElement('video')
    Object.defineProperties(video, {
      videoWidth: { value: 1280 },
      videoHeight: { value: 720 },
    })
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }))),
    }
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => (
      tagName === 'canvas' ? canvas : originalCreateElement(tagName)
    )) as typeof document.createElement)

    const file = await captureVideoFrame(video, 'screen')

    expect(file.type).toBe('image/png')
    expect(file.name).toMatch(/^screen-.*\.png$/u)
    expect(canvas.width).toBe(1280)
    expect(canvas.height).toBe(720)
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720)
  })

  it('stops every media track when the dialog closes', async () => {
    const stop = vi.fn()
    const track = { stop, addEventListener: vi.fn() }
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn(async () => stream), getUserMedia: vi.fn() },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const onOpenChange = vi.fn()
    const view = render(<MultimodalCaptureDialog open onOpenChange={onOpenChange} onCapture={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '共享屏幕' }))
    await waitFor(() => expect(screen.getByLabelText('实时画面预览')).toHaveProperty('srcObject', stream))
    view.rerender(<MultimodalCaptureDialog open={false} onOpenChange={onOpenChange} onCapture={vi.fn()} />)

    expect(stop).toHaveBeenCalledOnce()
  })

  it('stops a media stream that resolves after the dialog was closed', async () => {
    let resolveStream!: (stream: MediaStream) => void
    const pendingStream = new Promise<MediaStream>((resolve) => { resolveStream = resolve })
    const stop = vi.fn()
    const track = { stop, addEventListener: vi.fn() }
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn(), getUserMedia: vi.fn(() => pendingStream) },
    })
    const view = render(<MultimodalCaptureDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '打开摄像头' }))
    await screen.findByText('正在请求权限…')
    view.rerender(<MultimodalCaptureDialog open={false} onOpenChange={vi.fn()} onCapture={vi.fn()} />)
    resolveStream(stream)

    await waitFor(() => expect(stop).toHaveBeenCalledOnce())
    expect(screen.queryByText('正在请求权限…')).not.toBeInTheDocument()
  })
})
