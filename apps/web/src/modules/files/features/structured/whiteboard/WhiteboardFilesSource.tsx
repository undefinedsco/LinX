import { useMemo, type ReactNode } from 'react'

import { useFilesCurrentPodRootUri, useFilesPodSearchEntries } from '../../../data/queries'
import { projectWhiteboardLibraryFiles } from '../../../domain/structured/whiteboard-space-index'
import type { WhiteboardLibraryItem } from './WhiteboardLibraryPanel'

const NO_FILES: WhiteboardLibraryItem[] = []

function PodFiles({ children }: { children: (files: WhiteboardLibraryItem[]) => ReactNode }) {
  const entries = useFilesPodSearchEntries(true)
  const podRootUri = useFilesCurrentPodRootUri()
  const files = useMemo(
    () => projectWhiteboardLibraryFiles(entries.data ?? [], podRootUri),
    [entries.data, podRootUri],
  )
  return <>{children(files)}</>
}

/** Loads the Pod's files only while the library's file tab is showing. */
export function WhiteboardFilesSource({
  enabled,
  children,
}: {
  enabled: boolean
  children: (files: WhiteboardLibraryItem[]) => ReactNode
}) {
  return enabled ? <PodFiles>{children}</PodFiles> : <>{children(NO_FILES)}</>
}
