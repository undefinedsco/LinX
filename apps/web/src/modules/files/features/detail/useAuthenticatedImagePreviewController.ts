import { useEffect, useState } from 'react'

import { useBlobResource } from '../../data/queries'

export function useAuthenticatedImagePreviewController({
  enabled,
  mimeType,
  uri,
}: {
  enabled: boolean
  mimeType?: string | null
  uri: string
}) {
  const blobQuery = useBlobResource(uri, enabled && (mimeType?.startsWith('image/') ?? false))
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    const blob = blobQuery.data?.blob
    if (!blob) {
      setObjectUrl(null)
      return
    }
    const nextObjectUrl = URL.createObjectURL(blob)
    setObjectUrl(nextObjectUrl)
    return () => {
      URL.revokeObjectURL(nextObjectUrl)
    }
  }, [blobQuery.data?.blob])

  return {
    error: blobQuery.error,
    isLoading: blobQuery.isLoading,
    objectUrl,
  }
}
