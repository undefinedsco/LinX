import { useMemo } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useQuery } from '@tanstack/react-query'
import { solidProfileTable, type SolidProfileRow } from '@linx/models'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Edit3, Share2, Copy, MapPin, User } from 'lucide-react'
import { cn } from '@/lib/utils'

// Simple toast alternative
const toast = {
  success: (msg: string) => console.log('[Toast Success]', msg),
}

export function SelfProfileCard() {
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const webId = session.info.webId

  // Query Profile
  const { data: profile } = useQuery({
    queryKey: ['profile', webId],
    queryFn: async () => {
      if (!db || !webId) return null
      const record = await db.findByIri(solidProfileTable, webId)
      return record as SolidProfileRow | null
    },
    enabled: !!db && !!webId,
  })

  // Computed fields
  const displayName = profile?.displayName || profile?.nickname || 'Linq 用户'
  const displayAvatar = profile?.avatarUrl || ''
  const displayId = webId || 'Unknown ID'
  const region = profile?.region || profile?.city || ''
  const gender = profile?.gender

  const handleCopyId = () => {
    if (webId) {
      navigator.clipboard.writeText(webId)
      toast.success('WebID 已复制')
    }
  }

  const handleEdit = () => {
    // Navigate to settings or open edit modal
    // For now, placeholder
    alert('Edit profile coming soon')
  }

  const handleShare = () => {
    if (webId) {
      navigator.clipboard.writeText(webId)
      toast.success('链接已复制')
    }
  }

  return (
    <div className="w-80 p-0">
      {/* Header / Avatar Area */}
      <div className="flex items-center gap-4 p-4 pb-2">
        <Avatar className="w-16 h-16 rounded-xl border border-border/40 shadow-sm">
          <AvatarImage src={displayAvatar} className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
            {displayName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold truncate flex items-center gap-1.5">
            {displayName}
            {gender === 'male' && <span className="text-blue-500 text-xs">♂</span>}
            {gender === 'female' && <span className="text-pink-500 text-xs">♀</span>}
          </h3>
          <p className="text-xs text-muted-foreground truncate opacity-80 font-mono">
            {displayId.split('/')[2] || 'localhost'}
          </p>
        </div>
      </div>

      {/* Info Rows */}
      <div className="px-4 py-2 space-y-3">
        {/* WebID */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>WebID</span>
            <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-muted" onClick={handleCopyId} title="复制">
              <Copy className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-xs font-mono bg-muted/30 p-1.5 rounded break-all border border-border/20">
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

      <Separator className="my-2 bg-border/40" />

      {/* Action Buttons */}
      <div className="px-4 pb-4 pt-2 flex gap-3">
        <Button className="flex-1 h-9" onClick={handleEdit}>
          <Edit3 className="w-4 h-4 mr-2" />
          编辑资料
        </Button>
        <Button variant="outline" className="flex-1 h-9" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" />
          分享名片
        </Button>
      </div>
    </div>
  )
}
