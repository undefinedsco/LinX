import { useCallback, useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MatrixNativeGrantPanel } from '@/lib/matrix/MatrixNativeGrantPanel'
import { MatrixInterfaceAuthorizeUnavailableError } from '@/lib/matrix/pod-interface-access'
import { usePodInterfaceAccess } from '@/lib/matrix/usePodInterfaceAccess'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useChatStore } from '../store'
import { useLiveQuery } from '@tanstack/react-db'
import { chatCollection } from '../collections'
import {
  acceptMatrixInvitation,
  isInvitationBindingUsable,
  loadMatrixInvitations,
  type MatrixRoomInvitation,
} from '../data/matrix-invitations'
import { sharedRoomReferenceFromInvitation } from '../data/shared-room-reference'
import { rememberSharedRoom } from '../data/shared-room-index'

/**
 * Pending Matrix room invitations from the person's own service.
 *
 * Discovery is read-only and never joins. A person without a Matrix credential
 * can authorize here explicitly (or use the native Account page); there is no
 * automatic grant. Joining happens only on the explicit button.
 */
export function MatrixInvitationList() {
  const matrixAccess = usePodInterfaceAccess()
  const { db } = useSolidDatabase()
  const [invitations, setInvitations] = useState<MatrixRoomInvitation[]>([])
  const [joined, setJoined] = useState<{ roomId: string; chatId: string } | null>(null)
  const selectChat = useChatStore((state) => state.selectChat)
  const chatQuery = useLiveQuery(chatCollection)
  const chatRows = (chatQuery.data ?? []) as Array<{ id: string; metadata?: Record<string, unknown> | null }>
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const [nativeGrant, setNativeGrant] = useState(false)
  const [acceptingRoomId, setAcceptingRoomId] = useState<string | null>(null)
  const authorized = Boolean(matrixAccess?.get())

  const load = useCallback(async () => {
    if (!db || !matrixAccess?.get()) return
    setLoading(true)
    setError(null)
    try {
      setInvitations(await loadMatrixInvitations({ db, access: matrixAccess }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取群聊邀请失败。')
    } finally {
      setLoading(false)
    }
  }, [db, matrixAccess])

  useEffect(() => {
    void load()
  }, [load])

  const authorize = async () => {
    if (!matrixAccess) return
    setAuthorizing(true)
    setError(null)
    try {
      await matrixAccess.authorize()
      setNativeGrant(false)
      await load()
    } catch (cause) {
      if (cause instanceof MatrixInterfaceAuthorizeUnavailableError) {
        setNativeGrant(true)
      } else {
        setError(cause instanceof Error ? cause.message : '群聊授权没有完成。')
      }
    } finally {
      setAuthorizing(false)
    }
  }

  const importKey = async (credential: { apiKey?: string; clientId?: string; clientSecret?: string }) => {
    if (!matrixAccess) return
    setAuthorizing(true)
    setError(null)
    try {
      await matrixAccess.importAuthorization(credential)
      setNativeGrant(false)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '访问凭据没有生效。')
    } finally {
      setAuthorizing(false)
    }
  }

  const accept = async (invitation: MatrixRoomInvitation) => {
    if (!db || !matrixAccess) return
    setAcceptingRoomId(invitation.roomId)
    setError(null)
    try {
      await acceptMatrixInvitation({ db, access: matrixAccess, invitation })
      // Local reference only: reads use the owner's canonical room, and the
      // owner's messages are never copied into this Pod.
      // Single-authority collection persistence; no direct DB insert. Wait for
      // the row to persist so selection/reload sees it immediately.
      const index = await rememberSharedRoom(sharedRoomReferenceFromInvitation(invitation), chatRows)
      setJoined({ roomId: invitation.roomId, chatId: index.id })
      setInvitations((current) => current.filter((item) => item.roomId !== invitation.roomId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加入群聊失败。')
    } finally {
      setAcceptingRoomId(null)
    }
  }

  if (!matrixAccess || !db) return null
  if (joined) {
    return (
      <section aria-label="群聊邀请" className="shrink-0 border-b border-border bg-muted/30 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <p className="text-foreground">已加入群聊</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2"
            onClick={() => selectChat(joined.chatId)}
          >
            打开
          </Button>
        </div>
      </section>
    )
  }
  if (!authorized) {
    return (
      <section aria-label="群聊邀请" className="shrink-0 border-b border-border bg-muted/30 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            授权后可以查看别人邀请你加入的群聊
          </p>
          <Button size="sm" variant="outline" className="h-7 shrink-0 px-2" disabled={authorizing} onClick={() => { void authorize() }}>
            {authorizing ? '正在授权…' : '授权群聊'}
          </Button>
        </div>
        {nativeGrant ? (
          <div className="mt-2">
            <MatrixNativeGrantPanel
              accountOrigin={matrixAccess.accountOrigin()}
              busy={authorizing}
              error={error}
              onImport={(credential) => { void importKey(credential) }}
              onCancel={() => { setNativeGrant(false); setError(null) }}
            />
          </div>
        ) : null}
        {error && !nativeGrant ? <p role="alert" className="mt-1 text-destructive">{error}</p> : null}
      </section>
    )
  }
  if (invitations.length === 0 && !error) return null

  return (
    <section aria-label="群聊邀请" className="shrink-0 border-b border-border bg-muted/30 px-3 py-2 text-xs">
      {invitations.map((invitation) => (
        <div key={invitation.roomId} className="flex items-start justify-between gap-2 py-1">
          <div className="flex min-w-0 items-start gap-2">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{invitation.name ?? '群聊邀请'}</p>
              <p className="text-muted-foreground">
                {isInvitationBindingUsable(invitation) ? '群主邀请你加入这个群聊' : '这个邀请暂时不能加入'}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2"
            disabled={!isInvitationBindingUsable(invitation) || acceptingRoomId === invitation.roomId}
            onClick={() => { void accept(invitation) }}
          >
            {acceptingRoomId === invitation.roomId ? '加入中…' : '接受'}
          </Button>
        </div>
      ))}
      {loading ? <p className="text-muted-foreground">正在检查群聊邀请…</p> : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
          <button type="button" className="ml-2 text-primary hover:underline" onClick={() => { void load() }}>
            重试
          </button>
        </p>
      ) : null}
    </section>
  )
}
