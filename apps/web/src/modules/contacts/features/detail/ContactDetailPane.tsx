import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { ContactDetail } from '../../ui/ContactDetail'
import { CreateGroupDialog } from '../groups/CreateGroupDialog'
import { useContactDetailController } from './useContactDetailController'

export function ContactDetailPane({}: MicroAppPaneProps) {
  const controller = useContactDetailController()
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
