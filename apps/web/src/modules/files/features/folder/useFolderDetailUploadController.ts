import { useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent } from 'react'

import { useToast } from '@/components/ui/use-toast'
import {
  useCreateBlobResource,
  useCreateFolderResource,
  useCreateRawTextResource,
} from '../../data/queries'
import { projectFolderUploadBatchPlan } from '../../domain/folder/folder-upload-model'

export function useFolderDetailUploadController({
  containerUri,
  onUploadedResource,
}: {
  containerUri: string | null
  onUploadedResource: (uri: string) => void
}) {
  const { toast } = useToast()
  const createRawText = useCreateRawTextResource()
  const createBlob = useCreateBlobResource()
  const createFolder = useCreateFolderResource()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const uploadFolderInputRef = useRef<HTMLInputElement | null>(null)
  const [isDropTargetActive, setIsDropTargetActive] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{
    completed: number
    total: number
    currentName: string
  } | null>(null)

  const uploadFiles = async (uploadedFiles: File[]) => {
    if (uploadedFiles.length === 0 || !containerUri) return
    try {
      const batchPlan = projectFolderUploadBatchPlan({ uploadedFiles, containerUri })
      const total = batchPlan.folders.length + batchPlan.resources.length
      let completed = 0
      setUploadProgress({ completed, total, currentName: uploadedFiles[0]?.name ?? '文件' })
      let lastResourceUri: string | null = null
      for (const folder of batchPlan.folders) {
        setUploadProgress({ completed, total, currentName: folder.name })
        await createFolder.mutateAsync({
          containerUri: folder.containerUri,
          name: folder.name,
        })
        completed += 1
        setUploadProgress({ completed, total, currentName: folder.name })
      }
      for (const plan of batchPlan.resources) {
        const uploadedFile = uploadedFiles[plan.fileIndex]
        if (!uploadedFile) continue
        setUploadProgress({ completed, total, currentName: uploadedFile.name })
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
        completed += 1
        setUploadProgress({ completed, total, currentName: uploadedFile.name })
      }
      if (lastResourceUri) {
        onUploadedResource(lastResourceUri)
        toast({ description: uploadedFiles.length === 1 ? '文件已上传' : `${uploadedFiles.length} 个文件已上传` })
      }
      setUploadProgress(null)
    } catch (error) {
      setUploadProgress(null)
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

  const uploadPickedFolder = async (event: ChangeEvent<HTMLInputElement>) => {
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
    openFolderUploadPicker: () => uploadFolderInputRef.current?.click(),
    openUploadPicker: () => uploadInputRef.current?.click(),
    uploadFolderInputRef,
    uploadInputRef,
    uploadPending: createFolder.isPending || createRawText.isPending || createBlob.isPending,
    uploadProgress,
    uploadPickedFolder,
    uploadPickedFiles,
  }
}
