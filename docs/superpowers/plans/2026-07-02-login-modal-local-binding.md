# Login Modal Local Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the compact WeChat-sized login modal and Local binding behavior described in `docs/login-modal-local-binding-spec.md`.

**Architecture:** Keep existing `useLoginController` and OIDC/local startup plumbing. Refactor the visible login modal into small presentational components that show either a remembered account, first-time undefineds Cloud/Local choice, configured provider list, progress, or recovery. The controller remains the owner of state transitions, Local startup, pending transaction, and binding verification.

**Tech Stack:** React 19, TypeScript, Tailwind, Vitest, Testing Library, existing `@linx/stores/login` store, existing desktop `localOnboarding` API.

---

## File map

- Modify `apps/web/src/modules/login/LoginModal.tsx`
  - Replace dashboard-like provider list with compact modal states.
  - Keep presentational-only behavior in this file.
- Modify `apps/web/src/modules/login/presentation.ts`
  - Rename visible Cloud/Local copy to `云端空间` / `本机空间` and remove Standalone/Custom from primary modal copy.
- Modify `apps/web/src/modules/login/types.ts`
  - Add optional compact-modal props only if existing `StoredAccount` fields cannot express provider/binding labels.
- Modify `apps/web/src/modules/login/provider-model.ts`
  - Add helper predicates for `undefineds` provider and configured third-party provider display if needed.
- Modify `apps/web/src/modules/login/hooks/use-providers.ts`
  - Keep Cloud and Local provider construction, but do not expose Standalone or default third-party catalog to primary compact modal.
  - Continue to return configured custom providers for the advanced provider list.
- Modify `apps/web/src/modules/login/controller.tsx`
  - Preserve Local startup and provisionCode flow.
  - Ensure remembered account continue never re-enters Cloud/Local selection.
  - Ensure first-time Local starts/prepares before OIDC.
- Modify `apps/web/src/modules/login/LoginModal.test.tsx`
  - Replace old provider-list expectations with compact modal assertions.
- Optional create `apps/web/src/modules/login/login-binding-label.ts`
  - Pure helper for remembered-account binding label if `LoginModal.tsx` becomes too large.
- Optional test `apps/web/src/modules/login/login-binding-label.test.ts`
  - Unit tests for label derivation.

## Task 1: Lock compact first-login UI behavior

**Files:**
- Modify: `apps/web/src/modules/login/LoginModal.test.tsx`
- Modify: `apps/web/src/modules/login/LoginModal.tsx`

- [ ] **Step 1: Write failing tests for first-time compact undefineds login**

Add or replace the old `shows provider selection when idle without stored account` test with:

```ts
it('shows compact first login with undefineds Cloud/Local data-space choice', () => {
  const props = createProps()

  render(<LoginModal {...props} />)

  expect(screen.getByText('LinX')).toBeTruthy()
  expect(screen.getByText('使用 undefineds 账号')).toBeTruthy()
  expect(screen.getByText('数据保存位置')).toBeTruthy()
  expect(screen.getByRole('button', { name: /云端/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /本机/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: '继续' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '其他账号供应商' })).toBeTruthy()

  expect(screen.queryByText('选择空间')).toBeNull()
  expect(screen.queryByText('登录方式')).toBeNull()
  expect(screen.queryByText('独立空间')).toBeNull()
  expect(screen.queryByText('IDP')).toBeNull()
  expect(screen.queryByText('SP')).toBeNull()
  expect(screen.queryByText('provisionCode')).toBeNull()
})
```

Add click assertions:

```ts
it('continues with selected undefineds data space only after clicking Continue', () => {
  const props = createProps()
  render(<LoginModal {...props} />)

  fireEvent.click(screen.getByRole('button', { name: /本机/ }))
  expect(props.onConnect).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: '继续' }))
  expect(props.onConnect).toHaveBeenCalledWith('local')
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/LoginModal.test.tsx
```

Expected: FAIL because current modal renders `选择空间` and provider rows, and may call `onConnect` directly from provider row click.

- [ ] **Step 3: Implement minimal compact first-login state**

In `LoginModal.tsx`, change `ProviderSelectionView` so it:

- derives `cloudProvider` from `source === 'cloud'`;
- derives `localProvider` from `source === 'local'`;
- keeps a local `selectedSpace` state of `'cloud' | 'local'`, default `'cloud'`;
- renders a compact segment instead of all primary provider rows;
- calls `onConnect(selectedProvider.id)` only from `继续`.

Implementation shape:

```tsx
function ProviderSelectionView({ providers, error, localLoginStatus, onConnect, onAddProvider, onClearError }: ProviderSelectionViewProps) {
  const [view, setView] = useState<'main' | 'providers'>('main')
  const [selectedSpace, setSelectedSpace] = useState<'cloud' | 'local'>('cloud')
  const [isAdding, setIsAdding] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const cloudProvider = providers.find((provider) => resolveLoginProviderSource(provider) === 'cloud')
  const localProvider = providers.find((provider) => resolveLoginProviderSource(provider) === 'local')
  const configuredProviders = providers.filter((provider) => resolveLoginProviderSource(provider) === 'custom')
  const selectedProvider = selectedSpace === 'local' && localProvider ? localProvider : cloudProvider

  if (view === 'providers') {
    return <ConfiguredProviderList ... />
  }

  return (
    <div className="flex-1 flex flex-col h-full px-7 py-7 text-center">
      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        <img src={linxLogoUrl} alt="LinX" className="h-12 w-12 rounded-2xl" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">LinX</h2>
          <p className="mt-2 text-sm text-muted-foreground">使用 undefineds 账号</p>
        </div>
        <div className="w-full space-y-2">
          <p className="text-xs font-medium text-muted-foreground">数据保存位置</p>
          <div className="grid grid-cols-2 rounded-xl border border-border/70 bg-muted/30 p-1">
            <button type="button" onClick={() => setSelectedSpace('cloud')} className={segmentClass(selectedSpace === 'cloud')}>云端</button>
            <button type="button" onClick={() => setSelectedSpace('local')} className={segmentClass(selectedSpace === 'local')}>本机</button>
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedSpace === 'local' ? '数据保存在这台电脑' : '数据同步到云端'}
          </p>
        </div>
      </div>
      <ErrorBanner error={error} onClearError={onClearError} />
      <button type="button" disabled={!selectedProvider} onClick={() => selectedProvider && onConnect(selectedProvider.id)} className="w-full h-11 rounded-xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50">继续</button>
      <button type="button" onClick={() => setView('providers')} className="mt-2 h-9 text-xs text-muted-foreground hover:text-foreground">其他账号供应商</button>
      <Footer />
    </div>
  )
}
```

Add helper:

```ts
function segmentClass(selected: boolean): string {
  return cn(
    'h-9 rounded-lg text-sm font-medium transition-colors',
    selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
  )
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/LoginModal.test.tsx
```

Expected: the new first-login tests pass; old tests that assert provider rows/Standalone are expected to fail until updated in Task 2.

## Task 2: Implement configured-provider list without default catalog

**Files:**
- Modify: `apps/web/src/modules/login/LoginModal.tsx`
- Modify: `apps/web/src/modules/login/LoginModal.test.tsx`
- Modify: `apps/web/src/modules/login/hooks/use-providers.ts` only if Standalone/default custom rows are still returned to the compact modal.

- [ ] **Step 1: Write failing tests for provider list rules**

Add:

```ts
it('does not ship a default third-party provider catalog', () => {
  render(<LoginModal {...createProps()} />)

  fireEvent.click(screen.getByRole('button', { name: '其他账号供应商' }))

  expect(screen.getByText('其他账号供应商')).toBeTruthy()
  expect(screen.getByText('undefineds')).toBeTruthy()
  expect(screen.getByText('支持云端空间和本机空间')).toBeTruthy()
  expect(screen.getByText('+ 添加供应商')).toBeTruthy()
  expect(screen.queryByText('Google')).toBeNull()
  expect(screen.queryByText('GitHub')).toBeNull()
  expect(screen.queryByText('企业 SSO')).toBeNull()
})

it('lists only configured third-party providers', () => {
  const props = createProps({
    providers: [
      ...createProps().providers,
      {
        id: 'acme-sso',
        url: 'https://sso.acme.example',
        label: 'Acme SSO',
        source: 'custom',
        oidcProvider: { kind: 'custom', url: 'https://sso.acme.example', label: 'Acme SSO' },
        storageProvider: { kind: 'custom', url: 'https://sso.acme.example', label: 'Acme SSO' },
      },
    ],
  })
  render(<LoginModal {...props} />)

  fireEvent.click(screen.getByRole('button', { name: '其他账号供应商' }))
  fireEvent.click(screen.getByRole('button', { name: /Acme SSO/ }))

  expect(screen.getByText('使用 Acme SSO 登录')).toBeTruthy()
  expect(screen.getByText('此供应商不支持本机空间选择')).toBeTruthy()
  expect(screen.queryByText('云端')).toBeNull()
  expect(screen.queryByText('本机')).toBeNull()
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/LoginModal.test.tsx
```

Expected: FAIL until provider-list subview exists.

- [ ] **Step 3: Implement provider-list subview**

Add `ConfiguredProviderList` in `LoginModal.tsx`:

```tsx
function ConfiguredProviderList({ providers, onConnect, onAddProvider, onBack }: {
  providers: LoginProviderOption[]
  onConnect: (providerKey: string) => void
  onAddProvider: (url: string, label?: string) => void
  onBack: () => void
}) {
  const [selectedProvider, setSelectedProvider] = useState<LoginProviderOption | null>(null)
  const configuredProviders = providers.filter((provider) => resolveLoginProviderSource(provider) === 'custom')

  if (selectedProvider) {
    return (
      <div className="flex-1 flex flex-col h-full px-7 py-7 text-center">
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <h2 className="text-lg font-semibold text-foreground">LinX</h2>
          <p className="text-base font-medium text-foreground">使用 {selectedProvider.label} 登录</p>
          <p className="text-sm text-muted-foreground">此供应商不支持本机空间选择</p>
        </div>
        <button type="button" onClick={() => onConnect(selectedProvider.id)} className="w-full h-11 rounded-xl bg-primary text-sm font-medium text-primary-foreground">继续</button>
        <button type="button" onClick={() => setSelectedProvider(null)} className="mt-2 h-9 text-xs text-muted-foreground">更换供应商</button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full px-5 py-5">
      <h2 className="text-base font-semibold text-foreground">其他账号供应商</h2>
      <div className="mt-4 flex-1 space-y-2">
        <button type="button" onClick={onBack} className="w-full rounded-xl border border-border/60 px-3 py-3 text-left">
          <p className="text-sm font-medium text-foreground">undefineds</p>
          <p className="mt-1 text-xs text-muted-foreground">支持云端空间和本机空间</p>
        </button>
        {configuredProviders.map((provider) => (
          <button key={provider.id} type="button" onClick={() => setSelectedProvider(provider)} className="w-full rounded-xl border border-border/60 px-3 py-3 text-left">
            <p className="text-sm font-medium text-foreground">{provider.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">已配置</p>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onAddProvider('', undefined)} className="h-9 text-xs text-muted-foreground">+ 添加供应商</button>
      <button type="button" onClick={onBack} className="h-9 text-xs text-muted-foreground">返回</button>
    </div>
  )
}
```

If `onAddProvider('', undefined)` is incompatible with current add flow, keep the existing inline URL input but place it behind `+ 添加供应商` in this subview only.

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/LoginModal.test.tsx
```

Expected: provider-list tests pass; no Google/GitHub/SSO default rows appear.

## Task 3: Remembered-account binding labels and no storage switch

**Files:**
- Modify: `apps/web/src/modules/login/LoginModal.tsx`
- Modify: `apps/web/src/modules/login/LoginModal.test.tsx`
- Optional create: `apps/web/src/modules/login/login-binding-label.ts`
- Optional test: `apps/web/src/modules/login/login-binding-label.test.ts`

- [ ] **Step 1: Write failing tests for remembered account labels**

Add:

```ts
it('shows remembered Local account with avatar and binding label without storage switch', () => {
  const props = createProps({
    state: 'idle',
    storedAccount: {
      displayName: 'Alice',
      issuerUrl: 'https://id.undefineds.co',
      issuerLabel: 'undefineds',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      webId: 'https://id.undefineds.co/alice/profile/card#me',
    },
  })

  render(<LoginModal {...props} />)

  expect(screen.getByText('Alice')).toBeTruthy()
  expect(screen.getByText('undefineds · 本机空间')).toBeTruthy()
  expect(screen.getByRole('button', { name: '继续使用 Alice' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '切换账号' })).toBeTruthy()
  expect(screen.queryByText('数据保存位置')).toBeNull()
  expect(screen.queryByRole('button', { name: /云端/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /本机/ })).toBeNull()
})

it('shows remembered Cloud account with cloud binding label', () => {
  const props = createProps({
    state: 'idle',
    storedAccount: {
      displayName: 'Bob',
      issuerUrl: 'https://id.undefineds.co',
      issuerLabel: 'undefineds',
      storageProviderUrl: 'https://cloud.undefineds.co/',
      storageProviderLabel: 'Cloud',
      webId: 'https://id.undefineds.co/bob/profile/card#me',
    },
  })

  render(<LoginModal {...props} />)

  expect(screen.getByText('undefineds · 云端空间')).toBeTruthy()
  expect(screen.getByRole('button', { name: '继续使用 Bob' })).toBeTruthy()
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/LoginModal.test.tsx
```

Expected: FAIL because `AccountView` currently lacks the binding label and uses `进入 LinX`/`继续登录`.

- [ ] **Step 3: Implement remembered label helper**

In `LoginModal.tsx` or `login-binding-label.ts`:

```ts
function getRememberedAccountBindingLabel(account: NonNullable<LoginModalProps['storedAccount']>): string {
  const marker = resolveStoredAccountSpaceMarker(account)
  const issuer = account.issuerLabel?.toLowerCase().includes('undefineds') || account.issuerUrl?.includes('id.undefineds.co')
    ? 'undefineds'
    : account.issuerLabel || '账号'

  if (marker === 'local') return `${issuer} · 本机空间`
  if (marker === 'standalone') return `${issuer} · 独立空间`
  if (account.storageProviderLabel?.toLowerCase() === 'cloud' || account.storageProviderUrl?.includes('undefineds')) return `${issuer} · 云端空间`
  return account.issuerLabel || issuer
}
```

Update `AccountView`:

```tsx
<p className="text-base font-semibold text-foreground">{storedAccount.displayName}</p>
<p className="text-xs text-muted-foreground">{getRememberedAccountBindingLabel(storedAccount)}</p>
...
<button ...>{hasRestorableSession ? `继续使用 ${storedAccount.displayName}` : `重新登录 ${storedAccount.displayName}`}</button>
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/LoginModal.test.tsx
```

Expected: remembered account tests pass.

## Task 4: Simplify Local progress/recovery states

**Files:**
- Modify: `apps/web/src/modules/login/LoginModal.tsx`
- Modify: `apps/web/src/modules/login/LoginModal.test.tsx`

- [ ] **Step 1: Write failing tests for login-path information density**

Add:

```ts
it('shows compact Local preparation copy without raw progress detail', () => {
  const props = createProps({
    view: 'local',
    localProviderSource: 'local',
    localOnboarding: {
      state: 'starting',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'https://node-0000.undefineds.co/',
      publicUrl: 'https://node-0000.undefineds.co/',
      tunnel: null,
      connectivity: null,
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'node-123',
      message: '安装 xpod runtime 包与生产依赖',
      progress: { phase: 'install-bun', label: '安装 xpod runtime 包与生产依赖', detail: 'bun install · @undefineds.co/xpod@0.3.4' },
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    },
  })

  render(<LoginModal {...props} />)

  expect(screen.getByText('正在准备本机空间')).toBeTruthy()
  expect(screen.getByText('正在启动本机服务')).toBeTruthy()
  expect(screen.queryByText('bun install · @undefineds.co/xpod@0.3.4')).toBeNull()
  expect(screen.queryByText('安装 xpod runtime 包与生产依赖')).toBeNull()
})
```

Add recovery test:

```ts
it('shows compact Local unavailable recovery without Cloud fallback', () => {
  const props = createProps({
    view: 'local',
    localProviderSource: 'local',
    localOnboarding: {
      state: 'error',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'https://node-0000.undefineds.co/',
      publicUrl: 'https://node-0000.undefineds.co/',
      tunnel: null,
      connectivity: null,
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: null,
      provisionUrl: null,
      nodeId: 'node-123',
      message: 'Cannot find module jsonld',
      errorCode: 'LOCAL_START_FAILED',
      canRetry: true,
      canOpenSettings: true,
    },
  })

  render(<LoginModal {...props} />)

  expect(screen.getByText('本机空间暂时不可用')).toBeTruthy()
  expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '打开设置' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '切换账号' })).toBeTruthy()
  expect(screen.queryByText(/使用云端/)).toBeNull()
  expect(screen.queryByText(/Cannot find module/)).toBeNull()
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/LoginModal.test.tsx
```

Expected: FAIL because current Local view exposes detailed progress and different recovery actions.

- [ ] **Step 3: Implement compact Local state rendering**

Update `LocalOnboardingView`:

- For `starting`, `checking`, `idle`, `space_required`: title `正在准备本机空间`; detail from a sanitizer returning one of the allowed strings.
- For `ready`: show `本机空间已准备好` and `继续` only.
- For `error` or `repair_required`: show `本机空间暂时不可用`, `重试`, `打开设置`, `切换账号`.

Add callback props if missing:

```ts
onSwitchAccount: () => void
```

Pass `props.onSwitchAccount` into `LocalOnboardingView` from `LoginModal`.

Minimal renderer:

```tsx
function getLocalPreparationDetail(state: LocalOnboardingState, progressPhase?: string): string {
  if (state === 'checking') return '正在验证本机空间'
  if (progressPhase === 'provision' || progressPhase === 'cloud-registration') return '正在准备登录授权'
  return '正在启动本机服务'
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/LoginModal.test.tsx
```

Expected: compact Local preparation/recovery tests pass.

## Task 5: Controller assertions for remembered Local and first Local timing

**Files:**
- Modify: `apps/web/src/modules/login/controller.test.tsx`
- Modify: `apps/web/src/modules/login/controller.tsx`

- [ ] **Step 1: Add or update controller tests**

Add tests that assert:

1. remembered Local account continue calls Local ensure/start path and does not show provider selection;
2. first undefineds Local goes through `startLocal` before OIDC;
3. third-party custom provider does not receive Local authorization query.

Test shape, using existing mocks in `controller.test.tsx`:

```ts
it('continues remembered Local account by ensuring Local runtime before auth', async () => {
  // Arrange rememberedAccount with storageProviderLabel Local and storageProviderUrl node URL.
  // Mock local onboarding ready snapshot with provisionCode.
  // Click continue stored account.
  // Assert startLocal or connectReadyLocalSnapshot path was used before oidc.connect.
})
```

Use the existing controller test utilities in that file rather than creating a new test harness.

- [ ] **Step 2: Run controller tests and verify failure if behavior is missing**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/controller.test.tsx
```

Expected: either PASS if existing controller already satisfies this, or FAIL with missing remembered Local ensure path.

- [ ] **Step 3: Implement only missing controller behavior**

If tests fail, update `continueStoredAccount` path in `controller.tsx` so:

- remembered Local/Standalone calls `startLocal` / `connectReadyLocalSnapshot`;
- remembered Cloud uses existing restore/auth flow;
- no remembered account path changes `storageProviderUrl` or reopens Cloud/Local selection.

Do not change `connectReadyLocalSnapshot` provisionCode behavior unless tests prove it is wrong.

- [ ] **Step 4: Run controller tests**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/controller.test.tsx
```

Expected: PASS.

## Task 6: Remove obsolete primary Standalone/Custom assumptions from tests and copy

**Files:**
- Modify: `apps/web/src/modules/login/LoginModal.test.tsx`
- Modify: `apps/web/src/modules/login/presentation.ts`
- Modify: `apps/web/src/modules/login/hooks/use-providers.ts` only if needed.

- [ ] **Step 1: Delete or rewrite obsolete tests**

Remove tests whose expected behavior contradicts the spec:

- `exposes Standalone as its own product login entry`
- `shows custom providers in a separate section` as a primary modal section
- assertions expecting provider status dots in primary login
- assertions expecting `选择空间` as primary title

Rewrite them to assert:

- Standalone is not in compact first-login primary UI;
- configured custom providers only appear after `其他账号供应商`;
- custom providers do not show Cloud/Local selector.

- [ ] **Step 2: Update presentation copy**

In `presentation.ts`, keep helpers safe for other surfaces, but ensure login modal copy uses:

```ts
cloud -> '云端空间'
local -> '本机空间'
standalone -> '独立空间' only outside compact primary modal
custom -> provider.label
```

- [ ] **Step 3: Run modal tests**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/LoginModal.test.tsx
```

Expected: PASS.

## Task 7: Visual and dimension pass

**Files:**
- Modify: `apps/web/src/modules/login/LoginCardShell.tsx`
- Modify: `apps/web/src/modules/login/LoginModal.tsx`
- Modify: `apps/web/src/modules/login/LoginModal.test.tsx`

- [ ] **Step 1: Add shell dimension test**

If `LoginCardShell` exposes `cardSize="compact"`, add a test or snapshot assertion that the compact shell includes width classes equivalent to 360-400px and does not become full dashboard width.

Example:

```ts
it('uses compact WeChat-sized shell for login modal', () => {
  const { container } = render(<LoginModal {...createProps()} />)
  expect(container.querySelector('[data-login-card-size="compact"]')).toBeTruthy()
})
```

- [ ] **Step 2: Add data attribute in `LoginCardShell`**

```tsx
<div data-login-card-size={cardSize} className={...}>
```

Ensure compact class is close to:

```ts
'w-[380px] min-h-[420px] max-h-[560px] rounded-[20px]'
```

- [ ] **Step 3: Run modal tests**

Run:

```bash
yarn workspace @linx/web test --run apps/web/src/modules/login/LoginModal.test.tsx
```

Expected: PASS.

## Task 8: Verification

**Files:**
- No code changes beyond previous tasks.

- [ ] **Step 1: Run focused login tests**

```bash
yarn workspace @linx/web test --run \
  apps/web/src/modules/login/LoginModal.test.tsx \
  apps/web/src/modules/login/controller.test.tsx \
  apps/web/src/modules/login/hooks/use-oidc-connect.test.tsx
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

- [ ] **Step 4: Run full web unit suite if time permits**

```bash
yarn workspace @linx/web test --run
```

Expected: PASS.

- [ ] **Step 5: Manual visual smoke**

Run:

```bash
yarn dev:web
```

Open login surface and verify:

- first login is compact;
- remembered account shows avatar and binding label;
- `其他账号供应商` has no default Google/GitHub/SSO rows;
- Local preparation does not expose raw logs or URLs;
- no IDP/SP/provisionCode/nodeId/token text appears in the modal.

## Self-review

Spec coverage:

- Compact modal size: Task 7.
- First login undefineds Cloud/Local: Task 1.
- No default provider catalog: Task 2.
- Remembered account avatar and binding label: Task 3.
- Local startup timing visible states: Task 4 and Task 5.
- No Cloud/Local switch for remembered accounts: Task 3.
- Third-party provider no storage picker: Task 2.
- Protocol/provisionCode flow: Task 5 keeps existing controller flow and verifies it.

Known non-goals in this plan:

- xpod service-side provision code changes are outside this LinX modal plan.
