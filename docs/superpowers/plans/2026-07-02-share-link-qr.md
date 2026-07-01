# Share Link QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add canonical resource share link and QR payload helpers for Cloud and Local resources, using last heartbeat as a non-blocking Local availability hint.

**Architecture:** Keep sharing as a small reusable web module first. The core helper accepts a canonical resource URL plus storage binding facts and returns display copy, link payload, QR payload, and Local availability hint. UI entry points can adopt this helper later without changing the sharing semantics.

**Tech Stack:** TypeScript, Vitest, React/Tailwind if a UI sheet is added, existing Web app test runner.

---

## File map

- Create `apps/web/src/modules/share/share-contract.ts`
  - Types for share storage kind, heartbeat, and generated share preview.
- Create `apps/web/src/modules/share/share-contract.test.ts`
  - Unit tests for Cloud/Local canonical URL, QR payload, no credentials, last-heartbeat hint.
- Optional create `apps/web/src/modules/share/SharePreview.tsx`
  - Presentational component for a link/QR preview. Only create if a visible UI entry point is needed in this iteration.
- Optional create `apps/web/src/modules/share/SharePreview.test.tsx`
  - Component tests for Cloud and Local copy.
- Modify relevant UI entry file only when wiring an entry point:
  - Chat/resource action file, file context menu, or detail pane. Pick one smallest existing entry point in implementation.

## Task 1: Add pure share contract helper

**Files:**
- Create: `apps/web/src/modules/share/share-contract.ts`
- Create: `apps/web/src/modules/share/share-contract.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/modules/share/share-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSharePreview } from './share-contract'

describe('createSharePreview', () => {
  it('uses canonical resource URL for Cloud link and QR payload', () => {
    const preview = createSharePreview({
      canonicalResourceUrl: 'https://cloud.undefineds.co/alice/chat/x/',
      storage: { kind: 'cloud' },
    })

    expect(preview.linkUrl).toBe('https://cloud.undefineds.co/alice/chat/x/')
    expect(preview.qrPayload).toBe('https://cloud.undefineds.co/alice/chat/x/')
    expect(preview.storageLabel).toBe('云端空间')
    expect(preview.hint).toBe('拥有权限的人可通过链接访问。')
  })

  it('uses canonical resource URL for Local link and QR payload', () => {
    const preview = createSharePreview({
      canonicalResourceUrl: 'https://node-0000.undefineds.co/alice/chat/x/',
      storage: {
        kind: 'local',
        lastHeartbeatAt: Date.now(),
        now: () => Date.now(),
      },
    })

    expect(preview.linkUrl).toBe('https://node-0000.undefineds.co/alice/chat/x/')
    expect(preview.qrPayload).toBe('https://node-0000.undefineds.co/alice/chat/x/')
    expect(preview.storageLabel).toBe('本机空间')
    expect(preview.hint).toBe('本机空间最近在线。对方访问时仍需保持在线。')
  })

  it('uses stale heartbeat as a weak hint and does not block generation', () => {
    const now = new Date('2026-07-02T12:00:00.000Z').getTime()
    const preview = createSharePreview({
      canonicalResourceUrl: 'https://node-0000.undefineds.co/alice/file.txt',
      storage: {
        kind: 'local',
        lastHeartbeatAt: now - 10 * 60 * 1000,
        now: () => now,
      },
    })

    expect(preview.linkUrl).toBe('https://node-0000.undefineds.co/alice/file.txt')
    expect(preview.hint).toBe('本机空间可能离线。链接仍可创建，对方打开时会再次检测。')
    expect(preview.blocksShare).toBe(false)
  })

  it('rejects credential-bearing share URLs', () => {
    expect(() => createSharePreview({
      canonicalResourceUrl: 'https://node-0000.undefineds.co/alice/file.txt?provisionCode=pc-123',
      storage: { kind: 'local' },
    })).toThrow('Share URL must not contain credentials or provision data')

    expect(() => createSharePreview({
      canonicalResourceUrl: 'https://cloud.undefineds.co/alice/file.txt#access_token=abc',
      storage: { kind: 'cloud' },
    })).toThrow('Share URL must not contain credentials or provision data')
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/share/share-contract.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement helper**

Create `apps/web/src/modules/share/share-contract.ts`:

```ts
export type ShareStorage =
  | { kind: 'cloud' }
  | { kind: 'local'; lastHeartbeatAt?: number | null; now?: () => number }

export interface SharePreviewInput {
  canonicalResourceUrl: string
  storage: ShareStorage
}

export interface SharePreview {
  linkUrl: string
  qrPayload: string
  storageLabel: '云端空间' | '本机空间'
  hint: string
  blocksShare: false
}

const HEARTBEAT_FRESH_MS = 2 * 60 * 1000
const CREDENTIAL_PATTERNS = [
  /access_token=/iu,
  /id_token=/iu,
  /refresh_token=/iu,
  /serviceToken=/iu,
  /serviceAccessToken=/iu,
  /provisionCode=/iu,
  /authorization=/iu,
]

export function createSharePreview(input: SharePreviewInput): SharePreview {
  const url = normalizeCanonicalResourceUrl(input.canonicalResourceUrl)
  assertNoCredentialMaterial(url)

  if (input.storage.kind === 'cloud') {
    return {
      linkUrl: url,
      qrPayload: url,
      storageLabel: '云端空间',
      hint: '拥有权限的人可通过链接访问。',
      blocksShare: false,
    }
  }

  return {
    linkUrl: url,
    qrPayload: url,
    storageLabel: '本机空间',
    hint: getLocalHeartbeatHint(input.storage),
    blocksShare: false,
  }
}

function normalizeCanonicalResourceUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Share URL must be an HTTP(S) resource URL')
  }
  return parsed.toString()
}

function assertNoCredentialMaterial(url: string): void {
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(url))) {
    throw new Error('Share URL must not contain credentials or provision data')
  }
}

function getLocalHeartbeatHint(storage: Extract<ShareStorage, { kind: 'local' }>): string {
  const heartbeat = typeof storage.lastHeartbeatAt === 'number' ? storage.lastHeartbeatAt : undefined
  const now = storage.now?.() ?? Date.now()
  if (heartbeat && now - heartbeat <= HEARTBEAT_FRESH_MS) {
    return '本机空间最近在线。对方访问时仍需保持在线。'
  }
  return '本机空间可能离线。链接仍可创建，对方打开时会再次检测。'
}
```

- [ ] **Step 4: Run test and verify pass**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/share/share-contract.test.ts
```

Expected: PASS.

## Task 2: Add optional share preview UI component

**Files:**
- Create: `apps/web/src/modules/share/SharePreview.tsx`
- Create: `apps/web/src/modules/share/SharePreview.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `apps/web/src/modules/share/SharePreview.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SharePreview } from './SharePreview'

const cloudPreview = {
  linkUrl: 'https://cloud.undefineds.co/alice/chat/x/',
  qrPayload: 'https://cloud.undefineds.co/alice/chat/x/',
  storageLabel: '云端空间' as const,
  hint: '拥有权限的人可通过链接访问。',
  blocksShare: false as const,
}

const localPreview = {
  linkUrl: 'https://node-0000.undefineds.co/alice/chat/x/',
  qrPayload: 'https://node-0000.undefineds.co/alice/chat/x/',
  storageLabel: '本机空间' as const,
  hint: '本机空间可能离线。链接仍可创建，对方打开时会再次检测。',
  blocksShare: false as const,
}

describe('SharePreview', () => {
  it('renders Cloud link and QR action', () => {
    render(<SharePreview preview={cloudPreview} onCopy={vi.fn()} onShowQr={vi.fn()} />)
    expect(screen.getByText('分享链接')).toBeTruthy()
    expect(screen.getByText('云端空间')).toBeTruthy()
    expect(screen.getByText('拥有权限的人可通过链接访问。')).toBeTruthy()
    expect(screen.getByText('https://cloud.undefineds.co/alice/chat/x/')).toBeTruthy()
  })

  it('renders Local heartbeat hint without blocking link actions', () => {
    const onCopy = vi.fn()
    const onShowQr = vi.fn()
    render(<SharePreview preview={localPreview} onCopy={onCopy} onShowQr={onShowQr} />)

    expect(screen.getByText('本机空间')).toBeTruthy()
    expect(screen.getByText('本机空间可能离线。链接仍可创建，对方打开时会再次检测。')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '复制链接' }))
    fireEvent.click(screen.getByRole('button', { name: '二维码' }))
    expect(onCopy).toHaveBeenCalledWith(localPreview.linkUrl)
    expect(onShowQr).toHaveBeenCalledWith(localPreview.qrPayload)
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/share/SharePreview.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement component**

Create `apps/web/src/modules/share/SharePreview.tsx`:

```tsx
import type { SharePreview as SharePreviewModel } from './share-contract'

export function SharePreview({ preview, onCopy, onShowQr }: {
  preview: SharePreviewModel
  onCopy: (url: string) => void
  onShowQr: (payload: string) => void
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">分享链接</h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {preview.storageLabel}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{preview.hint}</p>
      <p className="mt-3 break-all rounded-xl bg-muted/35 px-3 py-2 font-mono text-xs text-foreground">
        {preview.linkUrl}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onCopy(preview.linkUrl)} className="h-9 rounded-lg bg-primary text-sm font-medium text-primary-foreground">
          复制链接
        </button>
        <button type="button" onClick={() => onShowQr(preview.qrPayload)} className="h-9 rounded-lg border border-border text-sm font-medium text-foreground">
          二维码
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run component test and verify pass**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/share/SharePreview.test.tsx
```

Expected: PASS.

## Task 3: Wire one product entry point only if requested

**Files:**
- Modify one chosen feature entry point after inspection.
- Test corresponding component.

- [ ] **Step 1: Choose the smallest existing share entry point**

Use search:

```bash
rg -n "Share|share|复制链接|二维码|context menu|More" apps/web/src/modules
```

If no share entry exists, stop after Task 2 and report that the share contract/UI primitive is ready but not mounted.

- [ ] **Step 2: Add one entry point test**

For the chosen component, assert clicking Share opens `SharePreview` with the canonical resource URL.

- [ ] **Step 3: Implement the entry point**

Call:

```ts
createSharePreview({ canonicalResourceUrl, storage })
```

Use the current account/storage binding to choose:

```ts
storage.kind = storageBinding.kind === 'local' ? 'local' : 'cloud'
```

Pass last heartbeat if available from Local runtime status. If not available, omit it; the helper will show the stale/unknown hint and still allow share generation.

- [ ] **Step 4: Run focused entry point test**

Run the test for the touched component.

Expected: PASS.

## Task 4: Verification

- [ ] **Step 1: Run share tests**

```bash
yarn workspace @linx/web test --run \
  apps/web/src/modules/share/share-contract.test.ts \
  apps/web/src/modules/share/SharePreview.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run web typecheck**

```bash
yarn typecheck:web
```

Expected: PASS.

- [ ] **Step 3: Run web lint**

```bash
yarn lint:web
```

Expected: PASS.

## Self-review

Spec coverage:

- Cloud and Local can generate links: Task 1.
- QR uses same canonical URL: Task 1 and Task 2.
- No credentials/provisionCode/token in QR/link: Task 1.
- Local last heartbeat non-blocking hint: Task 1.
- Recipient-side open is the real availability check: represented by non-blocking helper and copy.

Known non-goals in this plan:

- Writing WAC/ACP/access grants is not implemented here; this plan only creates canonical share URL/QR primitives.
- Mounting share UI in every product surface is not required for the MVP; Task 3 wires at most one smallest entry point.
