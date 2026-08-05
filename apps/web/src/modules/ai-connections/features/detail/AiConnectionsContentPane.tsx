import { ModelEditorDialog } from '../../ui/ModelEditorDialog'
import { AiConnectionsDetailView } from '../../ui/AiConnectionsDetailView'
import { useAiConnectionsContentPaneController } from './useAiConnectionsContentPaneController'

export function AiConnectionsContentPane() {
  const { detailViewProps, editorDialogProps } = useAiConnectionsContentPaneController()
  return (
    <>
      <AiConnectionsDetailView {...detailViewProps} />
      <ModelEditorDialog {...editorDialogProps} />
    </>
  )
}
