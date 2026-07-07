import type { ReactNode } from 'react'
import { FolderTree } from 'lucide-react'

export interface FilesWorkspaceProps {
  list: ReactNode
  main: ReactNode
  detail: ReactNode
  mobileTreeOpen?: boolean
  onCloseMobileTree?: () => void
  onOpenMobileTree?: () => void
}

export function FilesWorkspace({
  detail,
  list,
  main,
  mobileTreeOpen = false,
  onCloseMobileTree,
  onOpenMobileTree,
}: FilesWorkspaceProps) {
  return (
    <>
      <button
        className="mobile-files-tree-button"
        aria-expanded={mobileTreeOpen}
        aria-label="Open file tree"
        onClick={() => window.setTimeout(() => onOpenMobileTree?.(), 0)}
      >
        <FolderTree size={16} />
        <span>Files</span>
      </button>
      <button
        className={`mobile-files-tree-backdrop ${mobileTreeOpen ? 'open' : ''}`}
        aria-label="Close file tree"
        onClick={() => window.setTimeout(() => onCloseMobileTree?.(), 0)}
        tabIndex={mobileTreeOpen ? 0 : -1}
      />
      {list}
      {main}
      {detail}
    </>
  )
}
