import { useEffect, useState } from 'react'
import { Box, Globe, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { AIConfigRuntimeCapability, type AIModelCapability } from '@undefineds.co/models'

export interface ModelEditorValue {
  id: string
  name: string
  enabled: boolean
  capabilities: string[]
  isCustom: boolean
}

export interface ModelEditorDialogProps {
  open: boolean
  initialValue?: ModelEditorValue
  onOpenChange: (open: boolean) => void
  onSave: (model: ModelEditorValue) => Promise<string | null>
}

const capabilityOptions = [
  { id: 'vision' satisfies AIModelCapability, label: 'Vision', icon: ImageIcon },
  { id: 'image_generation' satisfies AIModelCapability, label: 'Image Gen', icon: ImageIcon },
  { id: AIConfigRuntimeCapability.imageEditing, label: 'Image Edit', icon: ImageIcon },
  { id: 'tool_call' satisfies AIModelCapability, label: 'Tools', icon: Box },
  { id: 'web' satisfies AIModelCapability, label: 'Web', icon: Globe },
] as const

export function ModelEditorDialog({ open, initialValue, onOpenChange, onSave }: ModelEditorDialogProps) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setId(initialValue?.id ?? '')
    setName(initialValue?.name ?? '')
    setCapabilities(initialValue?.capabilities ?? [])
    setSaveError(null)
  }, [initialValue, open])

  const handleSubmit = async () => {
    if (!id) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const error = await onSave({
        id,
        name: name || id,
        enabled: true,
        capabilities,
        isCustom: true,
      })
      if (error) {
        setSaveError(error)
        return
      }
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  const toggleCapability = (capability: string) => {
    setCapabilities((current) => current.includes(capability)
      ? current.filter((item) => item !== capability)
      : [...current, capability])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{initialValue ? '编辑模型' : '添加自定义模型'}</DialogTitle>
          <div className="text-sm text-muted-foreground">
            {initialValue ? '修改模型信息' : '手动添加模型 ID 以支持新发布的模型'}
          </div>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="model-id" className="text-right">Model ID</Label>
            <Input
              id="model-id"
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="e.g. gpt-4-turbo"
              className="col-span-3 font-mono"
              disabled={Boolean(initialValue)}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="model-name" className="text-right">Name</Label>
            <Input
              id="model-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. GPT-4 Turbo"
              className="col-span-3"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="pt-2 text-right">Capabilities</Label>
            <div className="col-span-3 flex flex-wrap gap-2">
              {capabilityOptions.map(({ id: capability, label, icon: Icon }) => (
                <button
                  key={capability}
                  type="button"
                  onClick={() => toggleCapability(capability)}
                  className={cn(
                    'flex select-none items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-all',
                    capabilities.includes(capability)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-transparent bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  <Icon size={12} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!id || isSaving}
            className="rounded-md"
          >
            {isSaving ? '正在保存…' : initialValue ? '保存' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
