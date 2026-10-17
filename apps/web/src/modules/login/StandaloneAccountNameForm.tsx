import { useState } from 'react'
import { AlertCircle } from 'lucide-react'

/** Names compare without case and surrounding spaces. */
export function normalizeAccountName(value: string): string {
  return value.trim().toLowerCase()
}

export function isDuplicateAccountName(name: string, existing: readonly string[]): boolean {
  const normalized = normalizeAccountName(name)
  return normalized.length > 0 && existing.some((candidate) => normalizeAccountName(candidate) === normalized)
}

export interface StandaloneAccountNameFormProps {
  /** Account names already on this computer. */
  existingNames: readonly string[]
  /** 创建 with a free name. */
  onCreate: (name: string) => void
  /** 直接登录 with the account that already has this name. */
  onSignInExisting: (name: string) => void
}

/** S6b 独立空间：起账号名. A taken name says so and offers 直接登录 instead of creating. */
export function StandaloneAccountNameForm({ existingNames, onCreate, onSignInExisting }: StandaloneAccountNameFormProps) {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const duplicate = isDuplicateAccountName(trimmed, existingNames)

  return (
    <form
      className="flex flex-1 flex-col gap-3 px-5 py-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (trimmed && !duplicate) onCreate(trimmed)
      }}
    >
      <h2 className="text-base font-semibold text-foreground">给这台电脑上的账号起个名字</h2>
      <input
        autoFocus
        aria-label="账号名"
        aria-invalid={duplicate ? true : undefined}
        aria-describedby={duplicate ? 'standalone-account-name-error' : undefined}
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      {duplicate ? (
        <p id="standalone-account-name-error" role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          这个名字已经有了。直接登录，或者换一个。
        </p>
      ) : null}
      <div className="mt-auto flex gap-2">
        {duplicate ? (
          <button
            type="button"
            onClick={() => onSignInExisting(trimmed)}
            className="h-9 flex-1 cursor-pointer rounded-md border border-border/60 text-sm font-medium text-foreground hover:bg-muted/40"
          >
            直接登录
          </button>
        ) : null}
        <button
          type="submit"
          disabled={!trimmed || duplicate}
          className="h-9 flex-1 cursor-pointer rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          创建
        </button>
      </div>
    </form>
  )
}
