import type { FilesDetail } from '../../domain/resource/resource-model'
import { FileRdfMetadataPanel, SourceLinkedCardMetadataPanel } from '../detail/FileDetailMetadataPanels'
import { ResourceMetaTail } from '../sidecars/ResourceSidecars'
import type { ResourceMetaSidecarContentModel } from '../sidecars/resource-meta-sidecar-content-model'
import type { FileEditorSourceLinkedDescriptor } from './useFileEditorSheetController'

export function FileEditorSheetMetaTail({
  id,
  file,
  noteTitle,
  content,
  sourceLinkedDescriptor,
  sourceLinkedDescriptorUri,
}: {
  id: string
  file: FilesDetail
  noteTitle: string
  content: ResourceMetaSidecarContentModel
  sourceLinkedDescriptor?: FileEditorSourceLinkedDescriptor | null
  sourceLinkedDescriptorUri?: string
}) {
  return (
    <ResourceMetaTail id={id} content={content}>
      {sourceLinkedDescriptor ? (
        <SourceLinkedCardMetadataPanel
          documentUri={sourceLinkedDescriptorUri ?? file.uri}
          descriptor={sourceLinkedDescriptor}
          fallbackBodyResourceUri={file.uri}
        />
      ) : (
        <FileRdfMetadataPanel file={file} title={noteTitle} meta={content.meta ?? undefined} />
      )}
    </ResourceMetaTail>
  )
}
