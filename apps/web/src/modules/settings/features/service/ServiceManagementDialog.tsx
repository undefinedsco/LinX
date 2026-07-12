import { ServiceManagementDialog as ServiceManagementDialogUI } from '../../ui/ServiceManagementDialog'
import { useServiceManagementDialogController } from './useServiceManagementDialogController'

export interface ServiceManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ServiceManagementDialog({ open, onOpenChange }: ServiceManagementDialogProps) {
  const controller = useServiceManagementDialogController(open)
  return <ServiceManagementDialogUI open={open} onOpenChange={onOpenChange} {...controller} />
}
