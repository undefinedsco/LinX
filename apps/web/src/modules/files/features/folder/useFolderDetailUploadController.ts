import { useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent } from 'react'

import { useToast } from '@/components/ui/use-toast'
import {
  useCreateBlobResource,
  useCreateRawTextResource,
} from '../../data/queries'
import { projectFolderUploadResourcePlan } from '../../domain/folder/folder-upload-model'

export function useFolderDetailUploadController({
  containerUri,
  onUploadedResource,
}: {
  containerUri: string
  onUploadedResource: (uri: string) => void
}) {
  const { toast } = useToast()
  const createRawText = useCreateRawTextResource()
  const createBlob = useCreateBlobResource()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [isDropTargetActive, setIsDropTargetActive] = useState(false)

  const uploadFiles = async (uploadedFiles: File[]) => {
    if (uploadedFiles.length === 0) return
    try {
      let lastResourceUri: string | null = null
      for (const uploadedFile of uploadedFiles) {
        const plan = projectFolderUploadResourcePlan({ uploadedFile, containerUri })
        if (!plan) continue
        if (plan.contentKind === 'text') {
          const created = await createRawText.mutateAsync({
            resource: plan.resource,
            content: await uploadedFile.text(),
          })
          lastResourceUri = created.uri
        } else {
          const created = await createBlob.mutateAsync({
            resource: plan.resource,
            content: uploadedFile,
          })
          lastResourceUri = created.uri
        }
      }
      if (lastResourceUri) {
        onUploadedResource(lastResourceUri)
        toast({ description: uploadedFiles.length === 1 ? '文件已上传' : `${uploadedFiles.length} 个文件已上传` })
      }
    } catch (error) {
      toast({
        description: `上传失败：${error instanceof Error ? error.message : '未知错误'}`,
        variant: 'destructive',
      })
    }
  }

  const uploadPickedFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    await uploadFiles(uploadedFiles)
  }

  const handleUploadDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setIsDropTargetActive(true)
    }
  }

  const handleUploadDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.files.length) return
    event.preventDefault()
    setIsDropTargetActive(false)
    void uploadFiles(Array.from(event.dataTransfer.files))
  }

  return {
    handleUploadDragLeave: () => setIsDropTargetActive(false),
    handleUploadDragOver,
    handleUploadDrop,
    isDropTargetActive,
    openUploadPicker: () => uploadInputRef.current?.click(),
    uploadInputRef,
    uploadPending: createRawText.isPending || createBlob.isPending,
    uploadPickedFiles,
  }
}
