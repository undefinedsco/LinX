/**
 * CreateGroupDialog - Group creation dialog (CP1 functionalized)
 *
 * Allows users to create a group contact with:
 * - Group name input
 * - Unified participant search + multi-select (reuses SelectableContactList)
 * - Minimum 2 member validation
 * - Calls contactOps.createGroupWithChat() on submit
 * - Closes dialog on success
 */

import { useState, useMemo, useCallback } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useSession } from '@/providers/solid-session-context'
import { usePodInterfaceAccess } from '@/lib/matrix/usePodInterfaceAccess'
import { MatrixNativeGrantPanel } from '@/lib/matrix/MatrixNativeGrantPanel'
import { MatrixInterfaceAuthorizeUnavailableError } from '@/lib/matrix/pod-interface-access'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Users, AlertCircle } from 'lucide-react'
import { contactCollection, contactOps } from '../../data/collections'
import { isGroupContact, type ContactRow } from '@undefineds.co/models'
import { SelectableContactList } from '../../ui/SelectableContactList'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { formatMatrixErrorForUser } from '@/modules/chat/matrix-service'

interface CreateGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (contactId: string, chatId: string) => void
}

export function CreateGroupDialog({ open, onOpenChange, onCreated }: CreateGroupDialogProps) {
  const { session } = useSession()
  const matrixAccess = usePodInterfaceAccess()
  const [groupName, setGroupName] = useState('')
  const [participantSearch, setParticipantSearch] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [needsMatrixAuthorization, setNeedsMatrixAuthorization] = useState(false)
  const [needsMatrixNativeGrant, setNeedsMatrixNativeGrant] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ownerRef = session.info.webId ?? undefined

  const { data: allContacts = [] } = useLiveQuery(contactCollection)

  const candidateContacts = useMemo(
    () => allContacts.filter((c: ContactRow) =>
      !isGroupContact(c) && !c.deletedAt && typeof c.about === 'string' && c.about.length > 0
    ),
    [allContacts]
  )

  const filteredParticipants = useMemo(() => {
    if (!participantSearch.trim()) return candidateContacts
    const q = participantSearch.toLowerCase()
    return candidateContacts.filter(c =>
      c.name?.toLowerCase().includes(q) || c.alias?.toLowerCase().includes(q)
    )
  }, [candidateContacts, participantSearch])

  const toggleParticipant = useCallback((id: string) => {
    setSelectedParticipants(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const total = selectedParticipants.size + (ownerRef ? 1 : 0)
  const canCreate = groupName.trim().length > 0 && total >= 2

  const handleCreate = async () => {
    if (!canCreate || isCreating || isAuthorizing) return
    setError(null)
    if (matrixAccess && !matrixAccess.get()) {
      // The Pod interface key is created only from an explicit user action and
      // kept in memory for this session; never issued silently on dialog open.
      setNeedsMatrixAuthorization(true)
      return
    }
    await createGroup()
  }

  const authorizeAndCreate = async () => {
    if (!matrixAccess || isAuthorizing || isCreating) return
    setError(null)
    setIsAuthorizing(true)
    try {
      await matrixAccess.authorize()
      setNeedsMatrixAuthorization(false)
      setNeedsMatrixNativeGrant(false)
      await createGroup()
    } catch (err) {
      if (err instanceof MatrixInterfaceAuthorizeUnavailableError) {
        setNeedsMatrixNativeGrant(true)
      } else {
        setError(formatErrorForUser(err, '群聊授权没有完成，请稍后重试。'))
      }
    } finally {
      setIsAuthorizing(false)
    }
  }

  const importAndCreate = async (credential: { apiKey?: string; clientId?: string; clientSecret?: string }) => {
    if (!matrixAccess || isAuthorizing || isCreating) return
    setError(null)
    setIsAuthorizing(true)
    try {
      await matrixAccess.importAuthorization(credential)
      setNeedsMatrixAuthorization(false)
      setNeedsMatrixNativeGrant(false)
      await createGroup()
    } catch (err) {
      setError(err instanceof Error ? err.message : '访问凭据没有生效，请检查后重试。')
    } finally {
      setIsAuthorizing(false)
    }
  }

  const createGroup = async () => {
    if (!canCreate || isCreating) return
    setError(null)
    setIsCreating(true)
    try {
      const byId = new Map(allContacts.map((contact) => [contact.id, contact]))
      const participants = Array.from(selectedParticipants)
        .map((id) => byId.get(id)?.about)
        .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0)

      // Always use createGroupWithChat which validates member count
      const result = await contactOps.createGroupWithChat({
        name: groupName.trim(),
        participants,
        ownerRef,
        ...(matrixAccess ? { matrix: { access: matrixAccess } } : {}),
      })
      onCreated?.(result.id, result.chatId)
      handleClose()
    } catch (err) {
      const matrixMessage = formatMatrixErrorForUser(err)
      setError(matrixMessage ?? formatErrorForUser(err, '创建群组失败。请确认当前空间可写后再试。'))
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    setGroupName('')
    setParticipantSearch('')
    setSelectedParticipants(new Set())
    setNeedsMatrixAuthorization(false)
    setNeedsMatrixNativeGrant(false)
    setError(null)
    onOpenChange(false)
  }

  // Selected summary text
  const selectedNames = allContacts
    .filter(c => selectedParticipants.has(c.id))
    .map(c => c.alias || c.name)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建群组</DialogTitle>
          <DialogDescription>选择成员并创建群聊</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              群名称
            </label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="输入群组名称"
              className="h-9"
            />
          </div>

          <SelectableContactList
            title="添加参与者"
            icon={<Users className="w-4 h-4" />}
            contacts={filteredParticipants}
            selected={selectedParticipants}
            onToggle={toggleParticipant}
            search={participantSearch}
            onSearchChange={setParticipantSearch}
            showSearch
          />

          {total > 0 && (
            <div className="text-xs text-muted-foreground">
              已选: {selectedNames.join(', ') || '无'}（共 {total} 人{ownerRef ? '，包含你' : ''}）
              {total < 2 && (
                <span className="text-warning ml-1">（至少选择 {ownerRef ? 1 : 2} 人）</span>
              )}
            </div>
          )}

          {needsMatrixAuthorization && needsMatrixNativeGrant ? (
            <MatrixNativeGrantPanel
              accountOrigin={matrixAccess?.accountOrigin() ?? null}
              busy={isAuthorizing}
              error={error}
              onImport={(credential) => { void importAndCreate(credential) }}
              onCancel={() => {
                setNeedsMatrixNativeGrant(false)
                setError(null)
              }}
            />
          ) : needsMatrixAuthorization ? (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">群聊需要一次空间授权</p>
              <p className="mt-1">
                群消息通过当前空间收发。LinX 会为本次登录创建一个只用于这个空间的访问凭据，
                不会保存到本机，也不会发送给其他网站。
              </p>
            </div>
          ) : null}

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          {needsMatrixAuthorization ? (
            <Button onClick={authorizeAndCreate} disabled={isAuthorizing || isCreating}>
              {isAuthorizing ? '正在授权...' : '授权并创建'}
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={!canCreate || isCreating}>
              {isCreating ? '创建中...' : '创建群组'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
