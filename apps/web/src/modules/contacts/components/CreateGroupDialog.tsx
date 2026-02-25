/**
 * CreateGroupDialog - Group creation dialog
 *
 * Allows users to create a group contact with:
 * - Group name
 * - Member selection from existing contacts
 * - AI assistant selection from agent contacts
 * - Auto-creates a Chat record on submit
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
import { Users, Bot } from 'lucide-react'
import { contactOps } from '../collections'
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

  const canCreate = groupName.trim().length > 0 && selectedMembers.size >= 1

  const handleCreate = async () => {
    if (!canCreate || isCreating) return
    setIsCreating(true)
    try {
      const result = await contactOps.createGroup({
        name: groupName.trim(),
        memberIds: Array.from(selectedMembers),
        aiAssistantIds: Array.from(selectedAgents),
      })
      onCreated?.(result.id, result.chatId)
      handleClose()
    } catch (err) {
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
    onOpenChange(false)
  }

  // Selected summary text
  const total = selectedMembers.size + selectedAgents.size
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
