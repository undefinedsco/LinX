export function installPodStatusOutputFilter(): () => void {
  if (process.env.LINX_TUI_SHOW_POD_STATUS === '1') {
    return () => undefined
  }

  const restoreStdout = patchPodStatusWriter(process.stdout)
  const restoreStderr = patchPodStatusWriter(process.stderr)
  let restored = false

  return () => {
    if (restored) {
      return
    }
    restored = true
    restoreStdout()
    restoreStderr()
  }
}

export async function suppressPodStatusOutput<T>(operation: () => Promise<T>): Promise<T> {
  const restore = installPodStatusOutputFilter()
  try {
    return await operation()
  } finally {
    restore()
  }
}

export function filterPodStatusOutput(input: string): string {
  return input
    .replace(/^\[Container\]\s*容器已存在:[^\r\n]*(?:\r?\n)?/gm, '')
    .replace(/^Connecting to Solid Pod:[^\r\n]*(?:\r?\n)?/gm, '')
    .replace(/^Using WebID:[^\r\n]*(?:\r?\n)?/gm, '')
    .replace(/^Using explicit Pod URL; skipping Pod root probe[^\r\n]*(?:\r?\n)?/gm, '')
    .replace(/^Successfully connected to Solid Pod[^\r\n]*(?:\r?\n)?/gm, '')
}

function patchPodStatusWriter(stream: NodeJS.WriteStream): () => void {
  const originalWrite = stream.write.bind(stream) as typeof stream.write
  ;(stream as unknown as { write: typeof stream.write }).write = function patchedWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean {
    if (typeof chunk !== 'string') {
      return originalWrite(chunk, encodingOrCallback as BufferEncoding, callback)
    }

    const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined
    const onComplete = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback
    const filtered = filterPodStatusOutput(chunk)

    if (!filtered) {
      onComplete?.()
      return true
    }

    return originalWrite(filtered, encodingOrCallback as BufferEncoding, callback)
  } as typeof stream.write

  return () => {
    ;(stream as unknown as { write: typeof stream.write }).write = originalWrite
  }
}
