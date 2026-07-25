import { ChevronLeft } from 'lucide-react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { Button } from '@/components/ui/button'
import { useContactStore } from '@/modules/contacts/app/store'
import { ContactDetail } from '../../ui/ContactDetail'
import { ContactListPane } from '../list/ContactListPane'
import { CreateGroupDialog } from '../groups/CreateGroupDialog'
import { useContactDetailController } from './useContactDetailController'

export function ContactDetailPane({ compact = false, theme }: MicroAppPaneProps) {
  const controller = useContactDetailController()
  const selectedId = useContactStore((state) => state.selectedId)
  const select = useContactStore((state) => state.select)

  if (compact && !selectedId) {
    return <ContactListPane theme={theme} />
  }

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center border-b border-border/30 px-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => select(null)}
            aria-label="返回联系人列表"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            列表
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <ContactDetail {...controller} />
          <CreateGroupDialog
            open={controller.creation.open && controller.creation.type === 'group'}
            onOpenChange={(open) => {
              if (!open) controller.creation.onClose()
            }}
            onCreated={controller.creation.onGroupCreated}
          />
        </div>
      </div>
    )
  }

  return (
    <>
      <ContactDetail {...controller} />
      <CreateGroupDialog
        open={controller.creation.open && controller.creation.type === 'group'}
        onOpenChange={(open) => {
          if (!open) controller.creation.onClose()
        }}
        onCreated={controller.creation.onGroupCreated}
      />
    </>
  )
}

export default ContactDetailPane
