import { useRawTextResource, useSaveRawTextResource } from '../../../data/queries'
import WhiteboardBodyEditor from './WhiteboardBodyEditor'

/**
 * In-place editor for a document card: the file's own text, saved back with the same
 * write the card dialog uses for documents.
 */
export default function WhiteboardDocumentEditor({ uri, onDone }: { uri: string; onDone: () => void }) {
  const raw = useRawTextResource(uri, true)
  const save = useSaveRawTextResource()
  if (!raw.data) return <p className="text-muted-foreground">加载中…</p>
  const resource = raw.data
  return (
    <WhiteboardBodyEditor
      markdown={resource.content}
      onCommit={(markdown) => {
        onDone()
        void save.mutateAsync({ resource, content: markdown }).catch(() => undefined)
      }}
      onCancel={onDone}
    />
  )
}
