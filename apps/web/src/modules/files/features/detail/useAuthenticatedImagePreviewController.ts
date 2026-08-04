import { useEffect, useState } from 'react'

import { useBlobResource } from '../../data/queries'

export function useAuthenticatedImagePreviewController({
  enabled,
  uri,
}: {
  enabled: boolean
  uri: string
}) {
  const blobQuery = useBlobResource(uri, enabled)
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
