import { createContext, useContext, type ReactNode } from 'react'
import type { FilesRouteBridge } from './route-state'

const FilesRouteBridgeContext = createContext<FilesRouteBridge | null>(null)

export function FilesRouteBridgeProvider({
  bridge,
  children,
}: {
  bridge?: FilesRouteBridge | null
  children: ReactNode
}) {
  return (
    <FilesRouteBridgeContext.Provider value={bridge ?? null}>
      {children}
    </FilesRouteBridgeContext.Provider>
  )
}

export function useFilesRouteBridge() {
  return useContext(FilesRouteBridgeContext)
}
