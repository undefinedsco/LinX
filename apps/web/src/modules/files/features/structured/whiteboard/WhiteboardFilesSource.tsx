import { useMemo, type ReactNode } from 'react'

import { useFilesPodSearchEntries } from '../../../data/queries'
import type { WhiteboardLibraryItem } from './WhiteboardLibraryPanel'

const NO_FILES: WhiteboardLibraryItem[] = []

function PodFiles({ children }: { children: (files: WhiteboardLibraryItem[]) => ReactNode }) {
  const entries = useFilesPodSearchEntries(true)
  const files = useMemo(() => (entries.data ?? [])
    .filter((entry) => entry.kind !== 'container')
    .map((entry) => ({ uri: entry.uri, title: entry.name })), [entries.data])
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
