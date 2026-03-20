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
import { useSession } from '@inrupt/solid-ui-react'
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
import { contactOps } from '../collections'
import { isGroupContact, type ContactRow } from '@linx/models'
import { useQuery } from '@tanstack/react-query'
import { SelectableContactList } from './SelectableContactList'

interface CreateGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (contactId: string, chatId: string) => void
}

export function CreateGroupDialog({ open, onOpenChange, onCreated }: CreateGroupDialogProps) {
  const { session } = useSession()
  const [groupName, setGroupName] = useState('')
  const [participantSearch, setParticipantSearch] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ownerRef = session.info.webId ?? undefined

  const { data: allContacts = [] } = useQuery({
    queryKey: ['contacts', 'for-group-dialog'],
    queryFn: () => contactOps.getAll(),
    enabled: open,
  })

  const candidateContacts = useMemo(
    () => allContacts.filter((c: ContactRow) =>
      !isGroupContact(c) && !c.deletedAt && typeof c.entityUri === 'string' && c.entityUri.length > 0
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
    if (!canCreate || isCreating) return
    setError(null)
    setIsCreating(true)
    try {
      const byId = new Map(allContacts.map((contact) => [contact.id, contact]))
      const participants = Array.from(selectedParticipants)
        .map((id) => byId.get(id)?.entityUri)
        .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0)

      // Always use createGroupWithChat which validates member count
      const result = await contactOps.createGroupWithChat({
        name: groupName.trim(),
        participants,
        ownerRef,
      })
      onCreated?.(result.id, result.chatId)
      handleClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建群组失败'
      setError(msg)
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    setGroupName('')
    setParticipantSearch('')
    setSelectedParticipants(new Set())
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
                <span className="text-amber-500 ml-1">（至少选择 {ownerRef ? 1 : 2} 人）</span>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button onClick={handleCreate} disabled={!canCreate || isCreating}>
            {isCreating ? '创建中...' : '创建群组'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
