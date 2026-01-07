import { useState, useCallback } from 'react'

interface UseCopyToClipboardReturn {
  isCopied: boolean
  copyToClipboard: (text: string) => Promise<void>
}

export function useCopyToClipboard(timeout = 2000): UseCopyToClipboardReturn {
  const [isCopied, setIsCopied] = useState(false)

  const copyToClipboard = useCallback(
    async (text: string) => {
      if (!navigator?.clipboard) {
        console.warn('Clipboard not supported')
        return
      }

      try {
        await navigator.clipboard.writeText(text)
        setIsCopied(true)

        setTimeout(() => {
          setIsCopied(false)
        }, timeout)
      } catch (error) {
        console.error('Failed to copy text: ', error)
        setIsCopied(false)
      }
    },
    [timeout]
  )

  return { isCopied, copyToClipboard }
}
