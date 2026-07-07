import { Plus, Search, X } from 'lucide-react'
import type { IconType } from './files-types'

export { InfoRow } from './files-ui'

export function FileAvatarMark({ icon: Icon, active = false }: { icon: IconType; active?: boolean }) {
  return (
    <span className={active ? 'avatar-mark active' : 'avatar-mark'}>
      <Icon size={17} />
    </span>
  )
}

export function FilesSearchHeader({
  addLabel,
  onMobileClose,
  placeholder,
}: {
  addLabel?: string
  onMobileClose?: () => void
  placeholder: string
}) {
  return (
    <div className="search-header">
      <label>
        <Search size={14} />
        <input placeholder={placeholder} />
      </label>
      {addLabel ? (
        <button className="ghost-add">
          <Plus size={17} />
          <span>{addLabel}</span>
        </button>
      ) : null}
      {onMobileClose ? (
        <button className="mobile-tree-close" aria-label="Close file tree" onClick={onMobileClose}>
          <X size={16} />
        </button>
      ) : null}
    </div>
  )
}
