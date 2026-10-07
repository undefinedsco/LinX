import { useEffect, useState } from 'react'
import { useSession } from '@/providers/solid-session-provider'
import { benchmarkPrivateFilesReadPath, type FilesPrivateCloudBenchmarkResult } from '../data/private-cloud-benchmark'
import { useFilesStore } from './store'

export function FilesPrivateCloudBenchmark() {
  const { session } = useSession()
  const selectedFileId = useFilesStore((state) => state.selectedFileId)
  const selectedTreeNodeId = useFilesStore((state) => state.selectedTreeNodeId)
  const [results, setResults] = useState<FilesPrivateCloudBenchmarkResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const search = new URLSearchParams(window.location.search)
  const enabled = import.meta.env.DEV && search.get('filesBenchmark') === '1'
  const folderUri = search.get('benchmarkFolder') || selectedTreeNodeId
  const fileUri = search.get('benchmarkFile') || selectedFileId

  useEffect(() => {
    if (!enabled) return
    if (!session.info.isLoggedIn) {
      setError('当前浏览器会话未登录。')
      return
    }
    if (!folderUri || !fileUri || fileUri.endsWith('/')) {
      setError('请先在 Files 中选择一个私有文件夹和一个私有文件。')
      return
    }

    let cancelled = false
    setError(null)
    void benchmarkPrivateFilesReadPath({
      authFetch: session.fetch,
      folderUri,
      fileUri,
    }).then((nextResults) => {
      if (!cancelled) setResults(nextResults)
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => {
      cancelled = true
    }
  }, [enabled, fileUri, folderUri, session.fetch, session.info.isLoggedIn])

  if (!enabled) return null

  return (
    <aside className="fixed bottom-4 right-4 z-[100] max-h-[70vh] w-[min(680px,calc(100vw-2rem))] overflow-auto border border-border bg-background p-4 shadow-xl">
      <h2 className="text-sm font-semibold">Private xpod Files benchmark</h2>
      <p className="mt-1 break-all text-xs text-muted-foreground">Folder: {folderUri ?? '未选择'}</p>
      <p className="break-all text-xs text-muted-foreground">File: {fileUri ?? '未选择'}</p>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {!results && !error ? <p className="mt-3 text-sm text-muted-foreground">正在通过当前 DPoP 会话实测...</p> : null}
      {results ? (
        <table className="mt-3 w-full text-left text-xs">
          <thead><tr><th>场景</th><th>状态</th><th>请求</th><th>中位数</th><th>p90</th></tr></thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.name} className="border-t border-border">
                <td className="py-1.5">{result.name}</td>
                <td>{result.status}</td>
                <td>{result.requests}</td>
                <td>{result.medianMs}ms</td>
                <td>{result.p90Ms}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </aside>
  )
}
