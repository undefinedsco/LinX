/**
 * CreateGroupDialog - Group creation dialog (CP1 functionalized)
 *
 * Allows users to create a group contact with:
 * - Group name input
 * - Contact search + multi-select (reuses SelectableContactList)
 * - AI assistant selection from agent contacts
 * - Minimum 2 member validation
 * - Calls contactOps.createGroupWithChat() on submit
 * - Closes dialog on success
 */

import { useState, useMemo, useCallback } from 'react'
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
import { Users, Bot, AlertCircle } from 'lucide-react'
import { contactOps } from '../collections'
import { CONTACTS_CP1_ENABLED } from '../feature-flags'
import { ContactType, type ContactRow } from '@linx/models'
import { useQuery } from '@tanstack/react-query'
import { SelectableContactList } from './SelectableContactList'

interface CreateGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (contactId: string, chatId: string) => void
}

export function CreateGroupDialog({ open, onOpenChange, onCreated }: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: allContacts = [] } = useQuery({
    queryKey: ['contacts', 'for-group-dialog'],
    queryFn: () => contactOps.getAll(),
    enabled: open,
  })

  const personalContacts = useMemo(
    () => allContacts.filter((c: ContactRow) =>
      c.contactType === ContactType.SOLID && !c.deletedAt
    ),
    [allContacts]
  )

  const agentContacts = useMemo(
    () => allContacts.filter((c: ContactRow) =>
      c.contactType === ContactType.AGENT && !c.deletedAt
    ),
    [allContacts]
  )

  const filteredPersonal = useMemo(() => {
    if (!memberSearch.trim()) return personalContacts
    const q = memberSearch.toLowerCase()
    return personalContacts.filter(c =>
      c.name?.toLowerCase().includes(q) || c.alias?.toLowerCase().includes(q)
    )
  }, [personalContacts, memberSearch])

  const toggleMember = useCallback((id: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleAgent = useCallback((id: string) => {
    setSelectedAgents(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // CP1: minimum 2 total members (human + AI)
  const total = selectedMembers.size + selectedAgents.size
  const canCreate = groupName.trim().length > 0 && total >= 2

  const handleCreate = async () => {
    if (!canCreate || isCreating) return
    setError(null)
    setIsCreating(true)
    try {
      // CP1: use createGroupWithChat which validates member count
      const createFn = CONTACTS_CP1_ENABLED
        ? contactOps.createGroupWithChat
        : contactOps.createGroup
      const result = await createFn.call(contactOps, {
        name: groupName.trim(),
        memberIds: Array.from(selectedMembers),
        aiAssistantIds: Array.from(selectedAgents),
      })
      onCreated?.(result.id, result.chatId)
      handleClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建群组失败'
      setError(msg)
      console.error('[CreateGroupDialog] Failed to create group:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    setGroupName('')
    setMemberSearch('')
    setSelectedMembers(new Set())
    setSelectedAgents(new Set())
    setError(null)
    onOpenChange(false)
  }

  // Selected summary text
  const selectedNames = allContacts
    .filter(c => selectedMembers.has(c.id) || selectedAgents.has(c.id))
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
            title="添加成员"
            icon={<Users className="w-4 h-4" />}
            contacts={filteredPersonal}
            selected={selectedMembers}
            onToggle={toggleMember}
            search={memberSearch}
            onSearchChange={setMemberSearch}
            showSearch
          />

          {agentContacts.length > 0 && (
            <SelectableContactList
              title="添加 AI 助手"
              icon={<Bot className="w-4 h-4" />}
              contacts={agentContacts}
              selected={selectedAgents}
              onToggle={toggleAgent}
            />
          )}

          {total > 0 && (
            <div className="text-xs text-muted-foreground">
              已选: {selectedNames.join(', ')} ({total}人)
              {total < 2 && (
                <span className="text-amber-500 ml-1">（至少选择 2 人）</span>
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
