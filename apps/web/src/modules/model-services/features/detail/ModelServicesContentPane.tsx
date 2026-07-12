import { ModelEditorDialog } from '../../ui/ModelEditorDialog'
import { ModelServicesDetailView } from '../../ui/ModelServicesDetailView'
import { useModelServicesContentPaneController } from './useModelServicesContentPaneController'

export function ModelServicesContentPane() {
  const { detailViewProps, editorDialogProps } = useModelServicesContentPaneController()
  return (
    <>
      <ModelServicesDetailView {...detailViewProps} />
      <ModelEditorDialog {...editorDialogProps} />
    </>
  )
}
