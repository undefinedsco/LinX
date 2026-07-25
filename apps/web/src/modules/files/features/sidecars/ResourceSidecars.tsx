import { useState, type ReactNode } from 'react'
import { ChevronDown, FileCog, Shield, ExternalLink, InfoIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import { useAccessPolicyDialogController, type ResourceSidecarActionTarget } from './useAccessPolicyDialogController'
import { useResourceMetaDrawerController } from './useResourceMetaDrawerController'
import type {
  ResourceMetaSidecarContentModel,
  ResourceMetaSidecarRawPanel,
} from './resource-meta-sidecar-content-model'
import { useResourceMetaSidecarContentController } from './useResourceMetaSidecarContentController'
import { useResourceSidecarActionsController } from './useResourceSidecarActionsController'

function MetaRows({ rows, compact = false }: { rows: [string, string][]; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3 border-b border-border/20 py-1.5 text-xs last:border-0">
          <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
          <span className="break-all text-right text-foreground/80">{value}</span>
        </div>
      ))}
    </div>
  )
}

function SidecarRawTextBlock({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <details aria-label="原始 .meta 数据" className="rounded-md border border-border/30 bg-muted/15">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
        原始数据
      </summary>
      <pre className="break-words border-t border-border/20 px-3 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
        {text}
      </pre>
    </details>
  )
}

function SidecarRawPanel({ panel }: { panel: ResourceMetaSidecarRawPanel | null }) {
  if (!panel) return null
  if (panel.kind === 'content') {
    return <SidecarRawTextBlock text={panel.text} />
  }

  return (
    <div className={panel.tone === 'warning'
      ? 'rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning'
      : 'rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground'}
    >
      {panel.message}
    </div>
  )
}

export function ResourceMetaSidecarContent({
  content,
  showUserMetadata = true,
}: {
  content: ResourceMetaSidecarContentModel
  showUserMetadata?: boolean
}) {
  if (content.status === 'loading') {
    return (
      <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        正在读取 .meta...
      </div>
    )
  }

  if (content.status === 'error') {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <p className="font-medium">无法读取 .meta。</p>
        <p className="mt-1 break-all text-[11px]">{content.errorMessage}</p>
      </div>
    )
  }

  if (content.status === 'unknown') {
    return (
      <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        无法确认 .meta 状态。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {showUserMetadata && content.userRows.length > 0 ? (
        <section aria-label="用户元数据">
          <p className="mb-1.5 text-[11px] font-medium text-foreground/80">元数据</p>
          <MetaRows rows={content.userRows} compact />
        </section>
      ) : null}
      {content.showSemanticRows ? (
        <section aria-label="链接与 Schema">
          <p className="mb-1.5 text-[11px] font-medium text-foreground/80">链接与 Schema</p>
          <MetaRows rows={content.semanticRows} compact />
        </section>
      ) : null}
      {content.showWorkspaceRows ? (
        <section aria-label="工作区状态">
          <p className="mb-1.5 text-[11px] font-medium text-foreground/80">工作区状态</p>
          <MetaRows rows={content.workspaceRows} compact />
        </section>
      ) : null}
      {content.rawPanel?.kind === 'notice' ? <SidecarRawPanel panel={content.rawPanel} /> : null}
      <details className="rounded-md border border-border/30 bg-muted/10">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">技术信息</summary>
        <div className="space-y-3 border-t border-border/20 p-3">
          {content.showFolderRows ? (
            <section>
              <p className="mb-1.5 text-[11px] font-medium text-foreground/80">文件夹摘要</p>
              <MetaRows rows={content.folderRows} compact />
            </section>
          ) : null}
          <MetaRows rows={content.metaRows} compact />
          {content.rawPanel?.kind === 'content' ? <SidecarRawPanel panel={content.rawPanel} /> : null}
        </div>
      </details>
    </div>
  )
}

export function ResourceMetaTail({
  id = 'files-file-meta-tail',
  content,
  children,
}: {
  id?: string
  content: ResourceMetaSidecarContentModel
  children?: ReactNode
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <section id={id} className="border-t border-border/40 bg-background px-8 py-5" aria-label="文件 meta">
      <div className="mx-auto flex w-full max-w-[800px] items-center justify-between border-b border-border/25 pb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <InfoIcon className="h-4 w-4" />
          Info
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? '收起 Info' : '展开 Info'}
          title={expanded ? '收起 Info' : '展开 Info'}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          data-resource-meta-tail-toggle="true"
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDown className={expanded ? 'h-4 w-4' : 'h-4 w-4 -rotate-90'} aria-hidden="true" />
        </button>
      </div>
      {expanded ? (
        <div className="mx-auto mt-3 w-full max-w-[800px] space-y-3">
          <div className="border-b border-border/20 pb-3">
            <p className="mb-1.5 text-[11px] font-medium text-foreground/80">文件</p>
            <MetaRows rows={content.fileRows} compact />
          </div>
          {children}
          <ResourceMetaSidecarContent content={content} showUserMetadata={false} />
        </div>
      ) : null}
    </section>
  )
}

export function ResourceMetaDrawer({
  file,
  target,
  open,
  defaultOpen = false,
  onClose,
  children,
  variant = 'aside',
  className,
}: {
  file: FilesDetail
  target: Pick<FilesEntry, 'uri' | 'kind'>
  open?: boolean
  defaultOpen?: boolean
  onClose: () => void
  children?: ReactNode
  variant?: 'aside' | 'embedded'
  className?: string
}) {
  const isOpen = open ?? defaultOpen
  const { metaQuery } = useResourceMetaDrawerController({ open: isOpen, target })
  const content = useResourceMetaSidecarContentController({ file, query: metaQuery })

  if (!isOpen) return null

  const body = (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <InfoIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="truncate text-sm font-medium text-foreground">.meta</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="关闭 .meta inspector" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4">
          {children}
          <ResourceMetaSidecarContent content={content} />
        </div>
      </ScrollArea>
    </>
  )

  if (variant === 'embedded') {
    return (
      <div aria-label="Resource .meta inspector" data-sidecar-coverage="content" className="flex h-full min-h-0 flex-col">
        {body}
      </div>
    )
  }

  return (
    <aside
      aria-label="Resource .meta inspector"
      data-sidecar-coverage="content"
      className={cn('flex w-[320px] max-w-[40%] shrink-0 flex-col border-l border-border/50 bg-background', className)}
    >
      {body}
    </aside>
  )
}

type CurrentAccessSourceState = ReturnType<typeof useAccessPolicyDialogController>['currentAccessSourceState']

function CurrentAccessSourceSummary({ state }: { state: CurrentAccessSourceState }) {
  if (state.kind === 'loading') {
    return <p className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">{state.message}</p>
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
        <p className="font-medium">{state.title}</p>
        <p className="mt-1 break-all text-[11px]">{state.message}</p>
      </div>
    )
  }
  if (state.kind !== 'linked') {
    return <p className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">{state.message}</p>
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
        {state.source.providerLabel}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground/80" title={state.source.uri}>
        {state.description}
      </span>
      <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
        {state.statusLabel}
      </span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        {state.source.inheritanceLabel}
      </span>
    </div>
  )
}

export function AccessPolicyDialog({
  file,
  onOpenPolicySource,
  open,
  onOpenChange,
}: {
  file: ResourceSidecarActionTarget
  onOpenPolicySource?: (uri: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const accessDialog = useAccessPolicyDialogController({
    file,
    onOpenPolicySource,
    open,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/40 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            权限
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            查看当前访问规则，并提交需要确认的权限变更。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4 text-xs">
          <div>
            <p className="mb-1 font-medium text-foreground/80">当前可访问性</p>
            <AccessMatrix
              rows={accessDialog.accessMatrixRows}
            />
          </div>
          <div>
            <p className="mb-1 font-medium text-foreground/80">当前权限来源</p>
            <CurrentAccessSourceSummary state={accessDialog.currentAccessSourceState} />
          </div>
          <div className="rounded-lg border border-border/40 bg-muted/15 p-3">
            <p className="mb-3 font-medium text-foreground/80">申请权限变更</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">访问对象</span>
                <select
                  aria-label="访问对象"
                  className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"
                  value={accessDialog.audience}
                  onChange={(event) => accessDialog.setAudience(event.target.value)}
                >
                  {accessDialog.audienceOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">权限级别</span>
                <select
                  aria-label="权限级别"
                  className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"
                  value={accessDialog.role}
                  onChange={(event) => accessDialog.setRole(event.target.value)}
                >
                  {accessDialog.roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-[11px] text-muted-foreground">Agent/WebID</span>
                <Input
                  aria-label="Agent/WebID"
                  className="h-8 text-xs"
                  disabled={accessDialog.audience !== 'agent'}
                  placeholder="https://agent.example/profile#me"
                  value={accessDialog.agentWebId}
                  onChange={(event) => accessDialog.setAgentWebId(event.target.value)}
                />
                {accessDialog.agentWebIdInvalid ? (
                  <span className="text-[11px] text-destructive">Agent/WebID 必须是 http(s) URL。</span>
                ) : null}
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-[11px] text-muted-foreground">说明</span>
                <Textarea
                  aria-label="说明"
                  className="min-h-16 text-xs"
                  placeholder="为什么需要这次权限变更"
                  value={accessDialog.reason}
                  onChange={(event) => accessDialog.setReason(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                {accessDialog.accessProposalHelp}
              </p>
              <Button size="sm" className="h-7 text-xs" disabled={!accessDialog.canCreateProposal || accessDialog.isCreatingProposal} onClick={accessDialog.createPendingProposal}>
                {accessDialog.isCreatingProposal ? '提交中...' : '提交申请'}
              </Button>
            </div>
            {accessDialog.hasDisplayedPendingProposals ? (
              <div className="mt-3 space-y-2">
                {accessDialog.displayedPendingProposals.map((proposal) => (
                  <div key={proposal.id} className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
                    <p className="font-medium">待确认的权限申请</p>
                    <p className="mt-1">
                      {proposal.audienceLabel} · {proposal.modes}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed">{proposal.reason}</p>
                    <p className="mt-1 break-all text-[10px] text-warning/80">{proposal.proposalResourceUri}</p>
                    <p className="mt-1 text-[10px] text-warning/80">等待确认；ACL/ACR 暂不变更。</p>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              提交后等待确认；确认前不会写入 ACL/ACR。
            </p>
          </div>
          <details className="rounded-md border border-border/40 bg-muted/10">
            <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground">
              技术信息
            </summary>
            <div className="grid gap-4 border-t border-border/20 p-3">
              <div>
                <p className="mb-1 font-medium text-foreground/80">资源</p>
                <p className="break-all rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">{accessDialog.sidecars.ownerUri}</p>
              </div>
              <div>
                <p className="mb-1 font-medium text-foreground/80">权限规则</p>
                <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
                    {accessDialog.currentPodPolicy.providerLabel}
                  </span>
                  <span className="text-foreground/80">
                    {accessDialog.currentPodPolicy.description}
                  </span>
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {accessDialog.currentPodPolicy.state}
                  </span>
                </div>
              </div>
              <div className="grid gap-2">
                {accessDialog.accessPolicySourceRows.map((row) => (
                  <PolicySourceRow
                    key={row.provider}
                    provider={row.provider}
                    uri={row.uri}
                    state={row.state}
                    canOpen={row.canOpen}
                    onOpenPolicySource={accessDialog.openPolicySource}
                  />
                ))}
              </div>
              <div className="grid gap-2 text-muted-foreground">
                <p className="font-medium text-foreground/80">策略维护</p>
                <p className="leading-relaxed">
                  当前只创建待确认的权限申请；真正写入 ACL/ACR 需要进入审批链。
                </p>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!accessDialog.canOpenCurrentAccessSource}
                    onClick={accessDialog.openCurrentAccessSource}
                  >
                    打开当前策略
                  </Button>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                系统会使用当前有效的访问规则，并在应用变更前检查可用性。
              </p>
            </div>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AccessMatrix({
  rows,
}: {
  rows: Array<{ label: string; value: string }>
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border/40 bg-muted/20">
      {rows.map(({ label, value }) => (
        <div key={label} className="grid grid-cols-[112px_minmax(0,1fr)] border-b border-border/30 last:border-b-0">
          <span className="bg-background/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">{label}</span>
          <span className="whitespace-pre-line px-3 py-2 text-[11px] text-foreground/80">{value}</span>
        </div>
      ))}
    </div>
  )
}

function PolicySourceRow({
  onOpenPolicySource,
  provider,
  uri,
  state,
  canOpen = false,
}: {
  onOpenPolicySource: (uri: string) => void
  provider: 'ACR' | 'ACL'
  uri: string
  state: string
  canOpen?: boolean
}) {
  const canOpenPolicySource = canOpen && state === '已找到'

  return (
    <div className="flex items-center gap-3 rounded-md border border-border/40 px-3 py-2">
      <span className="w-9 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-[10px] font-medium text-muted-foreground">
        {provider}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground/80" title={uri}>{uri}</span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        {state}
      </span>
      {canOpenPolicySource ? (
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`打开 ${provider} 权限文件`} onClick={() => onOpenPolicySource(uri)}>
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

export function ResourceSidecarActions({
  file,
  onMeta,
  showMeta = true,
  compact = false,
}: {
  file: ResourceSidecarActionTarget
  onMeta?: () => void
  showMeta?: boolean
  compact?: boolean
}) {
  const sidecarActions = useResourceSidecarActionsController(file)
  const buttonClassName = compact ? 'h-6 w-6' : 'h-8 w-8'
  const iconClassName = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <div className="flex items-center gap-1">
      {showMeta ? (
        <Button
          variant="ghost"
          size="icon"
          className={buttonClassName}
          aria-label="查看 .meta"
          title={`文件 .meta sidecar · ${sidecarActions.sidecars.metaUri}`}
          onClick={onMeta}
        >
          <FileCog className={iconClassName} />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className={buttonClassName}
        aria-label="查看 Access 来源"
        title="权限设置"
        onClick={sidecarActions.openAccessDialog}
      >
        <Shield className={iconClassName} />
      </Button>
      <AccessPolicyDialog
        file={file}
        open={sidecarActions.accessOpen}
        onOpenChange={sidecarActions.setAccessDialogOpen}
      />
    </div>
  )
}

export function ResourceSidecarMenuItems({
  file,
  onMeta,
  onAccess,
  showMeta = true,
}: {
  file: ResourceSidecarActionTarget
  onMeta?: () => void
  onAccess?: () => void
  showMeta?: boolean
}) {
  const sidecarActions = useResourceSidecarActionsController(file)

  return (
    <>
      {showMeta ? (
        <DropdownMenuItem onSelect={onMeta}>
          <FileCog className="mr-2 h-3.5 w-3.5" />
          查看 .meta
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={onAccess ?? sidecarActions.openAccessDialog}>
        <Shield className="mr-2 h-3.5 w-3.5" />
        查看 Access 来源
      </DropdownMenuItem>
      {onAccess ? null : (
        <AccessPolicyDialog
          file={file}
          open={sidecarActions.accessOpen}
          onOpenChange={sidecarActions.setAccessDialogOpen}
        />
      )}
    </>
  )
}
