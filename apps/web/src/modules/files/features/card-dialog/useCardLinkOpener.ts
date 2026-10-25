import { useCallback } from 'react'

import { useCardDialog } from '@/lib/card-dialog'

import { useFilesCurrentPodRootUri } from '../../data/queries'
import { parseCardPodLink } from '../../domain/card/card-dialog-model'

/**
 * Opens a link from a card or document body: one that points into the person's Pod becomes a card
 * in LinX (at the `#line=N` spot it names). Returns false for links that leave the Pod.
 */
export function useCardLinkOpener(): (href: string) => boolean {
  const podRootUri = useFilesCurrentPodRootUri()
  const open = useCardDialog((state) => state.open)
  return useCallback((href: string) => {
    const target = parseCardPodLink(href, podRootUri)
    if (!target) return false
    open({ uri: target.uri, locator: target.locator })
    return true
  }, [open, podRootUri])
}
