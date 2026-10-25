import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildAccountManagementUrl } from '@/modules/login/storage-reconciliation'

/**
 * Explicit fallback when the Account authority will not mint a credential for
 * this browser session: open the authoritative account page, then paste the
 * credential it shows. Nothing is created or stored by LinX beyond this tab's
 * memory; cancelling sends and creates nothing.
 */
export function MatrixNativeGrantPanel(input: {
  accountOrigin: string | null
  busy: boolean
  error?: string | null
  onImport: (credential: { apiKey?: string; clientId?: string; clientSecret?: string }) => void
  onCancel: () => void
}) {
  const [pastedKey, setPastedKey] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [showPair, setShowPair] = useState(false)
  const canImport = Boolean(
    pastedKey.trim() || (clientId.trim() && clientSecret.trim()),
  )

  const openAccountPage = () => {
    // Reuse the existing authoritative Account management URL contract.
    const managementUrl = buildAccountManagementUrl(input.accountOrigin)
    if (!managementUrl) return
    // Top-level browsing only; the Account authority owns its own page.
    window.open(managementUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div role="group" aria-label="群聊授权" className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">群聊需要一次空间授权</p>
      <p className="mt-1">
        打开账号页创建一个访问凭据，再粘贴回这里。凭据只在本次页面内使用，不会保存。
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={openAccountPage} disabled={!input.accountOrigin}>
          打开账号页
        </Button>
        <Input
          aria-label="访问凭据"
          className="h-8 max-w-64 text-xs"
          placeholder="粘贴 sk-… 访问凭据"
          value={pastedKey}
          onChange={(event) => setPastedKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowPair((current) => !current)}>
          {showPair ? '改用完整凭据' : '改用 ID / Secret'}
        </Button>
      </div>
      {showPair ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            aria-label="Client ID"
            className="h-8 max-w-52 text-xs"
            placeholder="Client ID"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Input
            aria-label="Client Secret"
            className="h-8 max-w-52 text-xs"
            type="password"
            placeholder="Client Secret"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      ) : null}
      {input.error ? <p className="mt-2 text-xs text-destructive">{input.error}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={input.busy || !canImport}
          onClick={() => input.onImport({
            ...(pastedKey.trim() ? { apiKey: pastedKey.trim() } : {}),
            ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
            ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
          })}
        >
          {input.busy ? '正在验证…' : '使用这个凭据'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={input.onCancel}>
          稍后
        </Button>
      </div>
    </div>
  )
}
