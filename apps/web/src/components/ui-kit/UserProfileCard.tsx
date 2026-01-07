import { ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Copy, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface UserProfileCardProps {
  name: string
  webId: string
  avatarUrl?: string
  region?: string
  gender?: 'male' | 'female' | 'bot' | string
  className?: string
  
  /** Custom footer actions */
  footer?: ReactNode
  
  /** Whether to show the copy ID button (default: true) */
  showCopyId?: boolean
  
  /** Optional click handler for copy */
  onCopyId?: () => void
}

export function UserProfileCard({
  name,
  webId,
  avatarUrl,
  region,
  gender,
  className,
  footer,
  showCopyId = true,
  onCopyId,
}: UserProfileCardProps) {
  
  const displayId = webId || 'Unknown ID'
  const shortId = webId.startsWith('http') 
    ? (webId.split('/')[2] || 'localhost') 
    : webId

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onCopyId) {
      onCopyId()
    } else {
      navigator.clipboard.writeText(webId)
    }
  }

  return (
    <div className={cn("w-full bg-card rounded-xl overflow-hidden", className)}>
      {/* Header / Avatar Area */}
      <div className="flex items-center gap-4 p-4 pb-2">
        <Avatar className="w-16 h-16 rounded-xl border border-border/40 shadow-sm shrink-0">
          <AvatarImage src={avatarUrl} className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
            {name.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold truncate flex items-center gap-1.5">
            {name}
            {gender === 'male' && <span className="text-blue-500 text-xs">♂</span>}
            {gender === 'female' && <span className="text-pink-500 text-xs">♀</span>}
          </h3>
          <p className="text-xs text-muted-foreground truncate opacity-80 font-mono" title={webId}>
            {shortId}
          </p>
        </div>
      </div>

      {/* Info Rows */}
      <div className="px-4 py-2 space-y-3">
        {/* WebID Detail */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>WebID</span>
            {showCopyId && (
              <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-muted" onClick={handleCopy} title="复制">
                <Copy className="w-3 h-3" />
              </Button>
            )}
          </div>
          <p className="text-xs font-mono bg-muted/30 p-1.5 rounded break-all border border-border/20 text-muted-foreground/80">
            {displayId}
          </p>
        </div>

        {/* Region (if set) */}
        {region && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            <span>{region}</span>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {footer && (
        <div className="px-4 pb-4 pt-2">
          {footer}
        </div>
      )}
    </div>
  )
}
