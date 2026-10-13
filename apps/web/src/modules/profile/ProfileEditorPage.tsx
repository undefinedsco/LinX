import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useCardDialog } from '@/lib/card-dialog'
import { cn } from '@/lib/utils'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useSettingsStore } from '@/modules/settings/app/store'
import { profileInitial, useAuthenticatedAvatar } from './avatar'
import { AVATAR_MAX_BYTES } from './avatar-upload'
import { accountHandle, profileDocumentUri } from './domain/account-handle'
import {
  CARD_FIELDS,
  CONTACT_FIELDS,
  PROFILE_FIELD_LABELS,
  fieldDisplayText,
  profileDisplayName,
  type ProfileFieldKey,
  type ProfileFieldSpec,
  type ProfileValues,
} from './domain/profile-fields'
import { useProfileEditor, type ProfileEditor } from './useProfileEditor'
import { useSpaceStatus } from './useSpaceStatus'

/**
 * S3c 编辑个人资料: one page, every row edits in place and saves straight to
 * profile/card#me. profile/card is public, so each group says so.
 */
export function ProfileEditorPage(_props: MicroAppPaneProps) {
  const editor = useProfileEditor()
  const navigate = useNavigate()
  const openCard = useCardDialog((state) => state.open)
  const selectSettingsSection = useSettingsStore((state) => state.selectSection)
  const space = useSpaceStatus()
  const [editing, setEditing] = useState<{ field: ProfileFieldKey; draft: string } | null>(null)
  const editingRef = useRef(editing)
  useEffect(() => {
    editingRef.current = editing
  }, [editing])

  const startEdit = (field: ProfileFieldKey) => {
    const next = { field, draft: editor.values[field] }
    editingRef.current = next
    setEditing(next)
  }
  const updateDraft = (draft: string) => {
    setEditing((current) => (current ? { ...current, draft } : current))
  }
  // Enter, blur and Esc can all arrive for the same edit; only the first counts.
  const finishEdit = (mode: 'save' | 'cancel', draftOverride?: string) => {
    const current = editingRef.current
    if (!current) return
    editingRef.current = null
    setEditing(null)
    if (mode === 'save') void editor.saveField(current.field, draftOverride ?? current.draft)
  }

  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    void navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
  }

  const openSpaceSettings = () => {
    selectSettingsSection('space')
    void navigate({ to: '/$microAppId', params: { microAppId: 'settings' } })
  }

  // The preview follows the row being typed in.
  const previewValues: ProfileValues = editing
    ? { ...editor.values, [editing.field]: editing.draft }
    : editor.values
  const savedQuietly = editor.status.kind === 'idle' || editor.status.kind === 'saved'

  return (
    <main aria-label="个人资料" className="flex h-full min-h-0 flex-col bg-layout-content">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="返回" onClick={goBack}>
          <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
        </Button>
        <h1 className="text-[15px] font-semibold">个人资料</h1>
        <span className="flex-1" />
        {savedQuietly && !editor.isLoading && !editor.loadFailed ? (
          <span className="hidden text-xs text-muted-foreground sm:inline">已存到你的空间</span>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs"
          title="profile/card 也是一张卡片"
          disabled={!editor.webId}
          onClick={() => openCard({ uri: profileDocumentUri(editor.webId), from: 'search' })}
        >
          在文件里打开
        </Button>
      </header>

      <SaveStatusLine editor={editor} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 py-6 sm:px-8 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 lg:max-w-[560px]">
            <AvatarBlock editor={editor} name={profileDisplayName(editor.values)} />

            <GroupLabel label="名片" isPublic />
            <Group>
              {CARD_FIELDS.map((spec) => (
                <FieldRow
                  key={spec.key}
                  spec={spec}
                  value={editor.values[spec.key]}
                  draft={editing?.field === spec.key ? editing.draft : null}
                  disabled={!editor.webId || editor.isLoading}
                  onStart={() => startEdit(spec.key)}
                  onDraftChange={updateDraft}
                  onFinish={finishEdit}
                />
              ))}
            </Group>
            <Foot>点一行就地改，回车或点别处就保存；按 Esc 放弃这次改动。</Foot>

            <GroupLabel label="联系方式" isPublic />
            <Group>
              {CONTACT_FIELDS.map((spec) => (
                <FieldRow
                  key={spec.key}
                  spec={spec}
                  value={editor.values[spec.key]}
                  draft={editing?.field === spec.key ? editing.draft : null}
                  disabled={!editor.webId || editor.isLoading}
                  onStart={() => startEdit(spec.key)}
                  onDraftChange={updateDraft}
                  onFinish={finishEdit}
                />
              ))}
            </Group>
            <Foot>个人资料存在你空间里的 profile/card，任何人和任何 Solid 应用都能读到。不想公开的就别填。</Foot>

            <GroupLabel label="账号" />
            <Group>
              <AccountRow webId={editor.webId} />
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-sm hover:bg-layout-list-hover"
                onClick={openSpaceSettings}
              >
                <span className="w-[72px] shrink-0">数据保存在</span>
                <span className="min-w-0 flex-1 truncate text-right text-[13px] text-muted-foreground">{space.spaceLabel}空间</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
              </button>
            </Group>
            <Foot>账号不能改。别人加你为朋友时，把“复制地址”拷到的完整地址发给他们。</Foot>
          </div>

          <aside aria-label="预览" className="w-full shrink-0 lg:sticky lg:top-0 lg:w-[300px]">
            <p className="px-1 pb-1.5 text-xs text-muted-foreground">别人在联系人里看到的你</p>
            <ContactPreview editor={editor} values={previewValues} />
            <Foot>边改边变；没填的不显示。空间里的其他内容默认只有你能看。</Foot>
          </aside>
        </div>
      </div>
    </main>
  )
}

export default ProfileEditorPage

function SaveStatusLine({ editor }: { editor: ProfileEditor }) {
  const { status } = editor
  let content: ReactNode = null
  let role: 'status' | 'alert' = 'status'

  if (editor.loadFailed) {
    role = 'alert'
    content = (
      <>
        <span className="flex-1">没读到你的个人资料，先别改</span>
        <Button size="sm" className="h-7 px-3 text-xs" onClick={editor.reload}>重试</Button>
      </>
    )
  } else if (status.kind === 'saving') {
    content = <span>正在保存…</span>
  } else if (status.kind === 'failed') {
    role = 'alert'
    content = (
      <>
        <span className="flex-1">{PROFILE_FIELD_LABELS[status.field]}没保存成功，改动还在</span>
        <Button size="sm" className="h-7 px-3 text-xs" onClick={editor.retry}>重试</Button>
      </>
    )
  } else if (status.kind === 'avatar-too-large') {
    role = 'alert'
    content = (
      <>
        <span className="flex-1">头像太大了（上限 {AVATAR_MAX_BYTES / 1024 / 1024} MB）</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={() => document.getElementById(AVATAR_INPUT_ID)?.click()}
        >
          换一张
        </Button>
      </>
    )
  } else if (status.kind === 'offline') {
    content = <span>没有网络，恢复后自动保存</span>
  } else if (status.kind === 'changed-elsewhere') {
    content = (
      <>
        <span className="flex-1">别的应用刚改了你的{PROFILE_FIELD_LABELS[status.field]}，已换成最新的</span>
        <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={editor.revertChange}>改回去</Button>
      </>
    )
  }

  if (!content) return null
  return (
    <div className="shrink-0 px-4 pt-3 sm:px-8">
      <div role={role} className="mx-auto flex min-h-9 max-w-[960px] items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-xs text-foreground">
        {content}
      </div>
    </div>
  )
}

const AVATAR_INPUT_ID = 'profile-avatar-input'

function AvatarBlock({ editor, name }: { editor: ProfileEditor; name: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { previewUrl, failed, markFailed } = useAuthenticatedAvatar(editor.values.avatar, editor.authFetch)
  const src = editor.avatarPreview ?? (failed ? null : previewUrl)

  return (
    <div className="flex items-center gap-4 pb-2">
      <Avatar className="h-[72px] w-[72px] rounded-lg">
        {src ? <AvatarImage src={src} alt={name} className="object-cover" onError={markFailed} /> : null}
        <AvatarFallback className="!rounded-lg bg-accent text-2xl font-semibold text-foreground">
          {profileInitial(name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col items-start gap-2">
        <span className="truncate text-lg font-semibold">{name}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={!editor.webId}
          onClick={() => inputRef.current?.click()}
        >
          更换头像…
        </Button>
        <input
          ref={inputRef}
          id={AVATAR_INPUT_ID}
          type="file"
          accept="image/*"
          aria-label="选择头像图片"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void editor.changeAvatar(file)
          }}
        />
      </div>
    </div>
  )
}

function GroupLabel({ label, isPublic = false }: { label: string; isPublic?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 px-1 pb-1.5 pt-5 text-xs text-muted-foreground">
      <span>{label}</span>
      {isPublic ? (
        <span className="inline-flex h-5 items-center rounded bg-accent px-1.5 text-[11px]">所有人可见</span>
      ) : null}
    </div>
  )
}

function Group({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-border">
      {children}
    </div>
  )
}

function Foot({ children }: { children: ReactNode }) {
  return <p className="px-1 pt-1.5 text-xs leading-5 text-muted-foreground">{children}</p>
}

function FieldRow({
  spec,
  value,
  draft,
  disabled,
  onStart,
  onDraftChange,
  onFinish,
}: {
  spec: ProfileFieldSpec
  value: string
  draft: string | null
  disabled: boolean
  onStart: () => void
  onDraftChange: (value: string) => void
  onFinish: (mode: 'save' | 'cancel', draftOverride?: string) => void
}) {
  const editing = draft !== null

  if (editing && spec.options) {
    return (
      <div className="flex min-h-11 items-center gap-2.5 px-3.5 text-sm">
        <label htmlFor={`profile-field-${spec.key}`} className="w-[72px] shrink-0">{spec.label}</label>
        <select
          id={`profile-field-${spec.key}`}
          autoFocus
          value={draft}
          className="h-[30px] flex-1 rounded-md border border-primary bg-background px-2 text-[13px] shadow-[0_0_0_3px_hsl(var(--primary)/0.14)] outline-none"
          onChange={(event) => onFinish('save', event.target.value)}
          onBlur={() => onFinish('cancel')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onFinish('cancel')
            }
          }}
        >
          {spec.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="flex min-h-11 items-center gap-2.5 px-3.5 text-sm">
        <label htmlFor={`profile-field-${spec.key}`} className="w-[72px] shrink-0">{spec.label}</label>
        <span className="flex h-[30px] flex-1 items-center gap-2 rounded-md border border-primary bg-background px-2.5 shadow-[0_0_0_3px_hsl(var(--primary)/0.14)]">
          <input
            id={`profile-field-${spec.key}`}
            autoFocus
            type={spec.inputType ?? 'text'}
            value={draft}
            maxLength={spec.maxLength}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            onChange={(event) => onDraftChange(event.target.value)}
            onBlur={() => onFinish('save')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                onFinish('save')
              } else if (event.key === 'Escape') {
                event.preventDefault()
                onFinish('cancel')
              }
            }}
          />
          {spec.showCount && spec.maxLength ? (
            <span className="shrink-0 text-xs text-muted-foreground" aria-hidden="true">
              {Array.from(draft).length} / {spec.maxLength}
            </span>
          ) : null}
        </span>
      </div>
    )
  }

  const text = fieldDisplayText(spec, value)
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${spec.label}，${text || '不填'}`}
      className="flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-sm hover:bg-layout-list-hover disabled:cursor-default disabled:hover:bg-transparent"
      onClick={onStart}
    >
      <span className="w-[72px] shrink-0">{spec.label}</span>
      <span className={cn('min-w-0 flex-1 truncate text-right text-[13px]', text ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
        {text || '不填'}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
    </button>
  )
}

function AccountRow({ webId }: { webId: string }) {
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null)
  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(null), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <div className="flex min-h-11 items-center gap-2.5 px-3.5 text-sm">
      <span className="w-[72px] shrink-0">账号</span>
      <span className="min-w-0 flex-1 truncate text-right text-[13px] text-muted-foreground">{accountHandle(webId)}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 px-3 text-xs"
        title="复制完整地址"
        disabled={!webId}
        onClick={() => {
          void navigator.clipboard.writeText(webId)
            .then(() => setCopied('done'), () => setCopied('failed'))
        }}
      >
        {copied === 'done' ? '已复制' : copied === 'failed' ? '没复制成功' : '复制地址'}
      </Button>
    </div>
  )
}

function ContactPreview({ editor, values }: { editor: ProfileEditor; values: ProfileValues }) {
  const name = profileDisplayName(values)
  const { previewUrl, failed } = useAuthenticatedAvatar(values.avatar, editor.authFetch)
  const src = editor.avatarPreview ?? (failed ? null : previewUrl)
  const details = [
    { label: '签名', value: values.note },
    { label: '地区', value: values.region },
  ].filter((item) => item.value.trim())

  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card" data-testid="profile-contact-preview">
      <div className="flex items-center gap-3 px-3.5 py-3.5">
        <Avatar className="h-12 w-12 rounded-lg">
          {src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
          <AvatarFallback className="!rounded-lg bg-accent text-lg font-semibold text-foreground">
            {profileInitial(name)}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold">{name}</span>
          {values.nick.trim() ? <span className="truncate text-xs text-muted-foreground">昵称：{values.nick}</span> : null}
          <span className="truncate text-xs text-muted-foreground">{accountHandle(editor.webId)}</span>
        </span>
      </div>
      {details.length > 0 ? (
        <dl className="grid grid-cols-[48px_1fr] gap-x-3 gap-y-1.5 border-t border-border px-3.5 py-3 text-[13px]">
          {details.map((item) => (
            <div key={item.label} className="contents">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="min-w-0 break-words">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
