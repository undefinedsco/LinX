# Login Modal and Local Binding Spec

- Status: Draft for implementation
- Last updated: 2026-07-02
- Owner surface: LinX desktop/web login, remembered account card, Local startup handoff, Cloud account consent handoff
- Related docs:
  - `DESIGN.md`
  - `docs/ui-style-guide.md`
  - `docs/ui-component-architecture.md`
  - `docs/login-identity-storage-routing-model.md`
  - `docs/local-sp-domain-and-tunnel.md`

## 1. Purpose

This spec defines the new LinX login dialog interaction and the Local storage
binding flow.

The dialog must feel as small and low-friction as a WeChat-style login modal:
compact, centered, avatar-first for remembered accounts, and free of
infrastructure jargon. The implementation may have a non-trivial state machine,
but the visible login path must stay simple.

The protocol goal is to keep identity and storage correct:

- Users log in through an account provider.
- Only the `undefineds` account provider supports the Cloud/Local data-space
  choice.
- A remembered account already has a WebID and storage binding; it must not ask
  the user to choose Cloud/Local again.
- Local registration and first Pod creation are driven by a Cloud-signed
  `provisionCode`, not by a client-supplied SP URL.
- Cloud and Local users can both share resources through links or QR codes.
  The link identity is the canonical resource URL; Local availability depends
  on the Local SP being reachable.

## 2. Terms

| Term | Product meaning | UI exposure |
| --- | --- | --- |
| Account provider | Where the user signs in. `undefineds` is the default; third-party providers are advanced login providers configured by users who know what they are doing. | Show `undefineds` and existing configured providers only. Do not ship a default catalog of provider brands in the compact login modal. |
| Data space | Where LinX stores data. Only `undefineds` supports choosing `Cloud` or `Local`. | Shown only before first undefineds login or when adding a new undefineds binding. |
| Storage binding | The post-login binding between WebID and actual storage base. | Shown as a short label such as `undefineds · 本机空间`; not editable inline. |
| Local SP | The local xpod storage provider. | Not named in login UI. Use `本机空间`. |
| provisionCode | Cloud-signed proof that a Local SP is the intended Pod creation target. | Never shown in login UI. May appear only in diagnostics. |
| Share link / QR | A canonical resource URL encoded as text or QR. | Shown in share UI after login, not in the login modal. |

## 3. Product rules

### 3.1 Account provider vs data space

The login model is not a generic IDP/SP picker.

Rules:

1. The default account provider is `undefineds`.
2. Only `undefineds` exposes the data-space choice:
   - `云端空间`: Cloud account + Cloud storage.
   - `本机空间`: Cloud account + Local xpod storage.
3. Third-party account providers do not expose `云端 / 本机` in the login modal.
   They use their own provider-default storage/account semantics until a
   separate product contract exists. The compact modal must not ship a default
   third-party provider catalog; it may list providers the user already
   configured and a small `添加供应商` action.
4. There is no Custom SP option in the primary login modal.
5. The login modal must not expose `IDP`, `SP`, `OIDC issuer`, `storage URL`,
   `nodeId`, `serviceToken`, or `provisionCode`.

### 3.2 Remembered account rule

A remembered account already has a binding:

```ts
rememberedAccount = {
  providerId,
  webId,
  displayName,
  avatarUrl,
  storageBinding: {
    kind: 'cloud' | 'local' | 'provider-default',
    storageBaseUrl,
    nodeId?,
  },
}
```

Rules:

1. Do not show a Cloud/Local switch for remembered accounts.
2. Show the binding as a label:
   - `undefineds · 本机空间`
   - `undefineds · 云端空间`
   - configured third-party provider label, for example `Acme SSO`
3. Changing a storage binding is not a toggle. It is a new binding/login flow
   that requires authorization again.
4. The primary actions are `继续`, `重新登录`, and `切换账号`.

### 3.3 Local startup timing

Local checks are split into two levels:

| Moment | Action | User-visible behavior |
| --- | --- | --- |
| App boot | Light probe remembered Local binding state. | Do not start xpod or block UI. Optional weak status only. |
| User clicks remembered Local account | Ensure Local runtime, validate/relogin session, verify binding, check reachability. | Small loading state inside modal. |
| First undefineds Local login | Prepare Local runtime and binding before Cloud auth. | Small `正在准备本机空间` state. |
| Callback completed | Verify storage binding and reachability. | Enter app or show Local recovery. |
| In-app runtime loss | Keep account session, show runtime connectivity problem. | Do not logout or silently switch to Cloud. |

Local startup is a precondition for entering a Local binding; it is not a side effect of simply opening the login dialog.

### 3.4 Consent and Pod creation

Local first-login and Local first-Pod flows are scoped by `provisionCode`.

Flow:

```text
User chooses undefineds + Local
  -> LinX starts/reuses local xpod
  -> local xpod registers/refreshes node with Cloud
  -> Cloud returns provisionCode
  -> LinX opens Cloud account/OIDC flow with provisionCode
  -> Cloud creates/selects Cloud WebID
  -> Cloud PodCreator sees settings.provisionCode
  -> ProvisionPodCreator decodes provisionCode
  -> Cloud calls Local SP POST /provision/pods with serviceAccessToken
  -> Local SP creates /<username>/ and writes local storage facts
  -> Cloud WebID profile points solid:storage to Local SP Pod URL
```

Rules:

1. xpod does not infer that a user is "from local". The branch is
   `settings.provisionCode` exists and validates.
2. The frontend must not pass arbitrary `storageBaseUrl` as authority.
3. Before the user is authenticated, the flow may know the Local node/root, but
   must not invent `/<username>/` as a final Pod URL.
4. After login, Cloud derives the concrete Pod URL from the authenticated WebID
   and provision scope.
5. If Local SP is unavailable during first Pod creation, Local registration
   fails closed. Do not fall back to Cloud storage.
6. For relogin of an existing Local binding, redirect callback can be received
   by LinX runtime even if the Local data route is temporarily down, but entering
   the app still requires binding/reachability handling.

### 3.5 Sharing by link or QR

Sharing is available for both Cloud and Local storage users.

Rules:

1. Share targets are resources or containers, not a whole account or whole SP.
2. The shared identifier is the canonical resource URL:
   - Cloud example: `https://cloud.undefineds.co/alice/chat/x/`
   - Local example: `https://node-0000.undefineds.co/alice/chat/x/`
3. Link and QR encode the same canonical resource URL. Do not wrap it in a
   LinX open URL for the MVP.
4. Permissions are written to the owner storage using Solid authorization
   semantics (WAC/ACP/access grant depending on the active storage mode).
5. The recipient accesses with their own identity/session. They do not receive
   the owner's token, `serviceToken`, or `provisionCode`.
6. For Cloud shares, availability is Cloud availability.
7. For Local shares, availability requires the owner Local SP route to be
   reachable. If offline, recipients see `对方的本机空间暂时不可访问`.
8. Cloud may store invitation/notification/control metadata, but must not
   silently proxy Local data unless a separate relay product decision is made.
9. QR and link generation must show a short availability hint for Local shares:
   `本机空间需要保持在线，对方才能访问。`

The login modal does not expose share controls, but the remembered binding label
and post-login account/storage state must be precise enough that share UI can
explain whether a resource is Cloud-backed or Local-backed.

## 4. Dialog size and visual constraints

The login modal should be comparable to a WeChat desktop login panel: compact,
centered, and focused on one decision or one account.

Target desktop size:

```text
Width: 360-400 px
Default height: 420-500 px
Max height: 560 px before internal scrolling
Corner radius: 18-20 px
Padding: 28-32 px outer, 16-20 px internal groups
Primary button height: 40-44 px
```

Visual rules:

1. Use neutral card surface, subtle border, shallow shadow.
2. Use system typography.
3. Use LinX purple only for the primary action, selected segment, and focus.
4. Avoid gradients, glow, emoji, large marketing titles, and dense technical
   tables.
5. Use visible text status, not color-only dots.
6. Advanced configuration belongs in Settings, not the login dialog.
7. The dialog should never look like a dashboard.

Information density rule:

- Normal login state: at most one title, one account/provider block, one primary
  action, and one or two secondary text actions.
- Loading state: one operation sentence and optional one-line detail.
- Error state: one problem sentence and up to three actions.

## 5. Interaction screens

### 5.1 First login, default undefineds

```text
┌────────────────────────────────────┐
│                                    │
│               LinX                 │
│                                    │
│        使用 undefineds 账号         │
│                                    │
│          数据保存位置               │
│                                    │
│        ┌───────┬───────┐           │
│        │ 云端  │ 本机  │           │
│        └───────┴───────┘           │
│                                    │
│        [ 继续 ]                    │
│                                    │
│        其他账号供应商               │
│                                    │
└────────────────────────────────────┘
```

Copy:

- `云端`: `数据同步到云端`
- `本机`: `数据保存在这台电脑`

The copy can be shown as one muted line under the segment, not as two large
cards.

### 5.2 Other account providers

The compact modal does not provide a default third-party provider catalog. It
only lists providers already configured by the user and an advanced add action.

No default rows such as Google, GitHub, or enterprise SSO should appear unless
the user has configured them.

```text
┌────────────────────────────────────┐
│  其他账号供应商                     │
├────────────────────────────────────┤
│  undefineds                        │
│  支持云端空间和本机空间              │
│                                    │
│  Acme SSO                          │
│  已配置                             │
│                                    │
│  + 添加供应商                       │
│                                    │
│  返回                               │
└────────────────────────────────────┘
```

When a configured non-undefineds provider is selected:

```text
┌────────────────────────────────────┐
│               LinX                 │
│                                    │
│          使用 Acme SSO 登录         │
│                                    │
│     此供应商不支持本机空间选择       │
│                                    │
│        [ 继续 ]                    │
│                                    │
│        更换供应商                   │
└────────────────────────────────────┘
```

### 5.3 Remembered undefineds Local account

```text
┌────────────────────────────────────┐
│                                    │
│               LinX                 │
│                                    │
│              (avatar)              │
│               Alice                │
│        undefineds · 本机空间        │
│                                    │
│        [ 继续使用 Alice ]           │
│                                    │
│        切换账号                     │
│                                    │
└────────────────────────────────────┘
```

Rules:

- Avatar is required in remembered-account state.
- Fallback avatar is the first display-name character.
- Do not show `云端 / 本机` selector.

### 5.4 Remembered undefineds Cloud account

```text
┌────────────────────────────────────┐
│               LinX                 │
│                                    │
│              (avatar)              │
│               Alice                │
│        undefineds · 云端空间        │
│                                    │
│        [ 继续使用 Alice ]           │
│                                    │
│        切换账号                     │
└────────────────────────────────────┘
```

### 5.5 Remembered third-party account

```text
┌────────────────────────────────────┐
│               LinX                 │
│                                    │
│              (avatar)              │
│               Carol                │
│              Acme SSO              │
│                                    │
│        [ 继续使用 Carol ]           │
│                                    │
│        切换账号                     │
└────────────────────────────────────┘
```

### 5.6 Re-login required

```text
┌────────────────────────────────────┐
│               LinX                 │
│                                    │
│              (avatar)              │
│               Alice                │
│        undefineds · 本机空间        │
│                                    │
│           需要重新登录              │
│                                    │
│        [ 重新登录 Alice ]           │
│                                    │
│        切换账号                     │
└────────────────────────────────────┘
```

### 5.7 Local preparing

```text
┌────────────────────────────────────┐
│               LinX                 │
│                                    │
│          正在准备本机空间           │
│                                    │
│          正在启动本机服务           │
│                                    │
│              取消                  │
└────────────────────────────────────┘
```

Allowed detail line values:

- `正在检查本机服务`
- `正在启动本机服务`
- `正在准备登录授权`
- `正在验证本机空间`
- `正在创建本机空间`

Do not show raw logs, node IDs, ports, tokens, URLs, or stack traces here.

### 5.8 Local unavailable

```text
┌────────────────────────────────────┐
│               LinX                 │
│                                    │
│          本机空间暂时不可用         │
│                                    │
│      请启动本机服务，或稍后重试。    │
│                                    │
│        [ 重试 ]                    │
│        打开设置                     │
│        切换账号                     │
└────────────────────────────────────┘
```

Rules:

1. Do not silently switch to Cloud.
2. `使用云端重新登录` may be offered only as an explicit secondary action in a
   later expanded error sheet, not as the default recovery.
3. If local-only is usable for desktop, the error should say `外部访问未配置`,
   not `本机空间不可用`.

### 5.9 Switch account

```text
┌────────────────────────────────────┐
│  切换账号                           │
├────────────────────────────────────┤
│  (A)  Alice                         │
│       undefineds · 本机空间          │
│                                    │
│  (B)  Bob                           │
│       undefineds · 云端空间          │
│                                    │
│  (C)  Carol                         │
│       Acme SSO                      │
│                                    │
│  + 使用其他账号登录                  │
│                                    │
│  返回                               │
└────────────────────────────────────┘
```

Rules:

- Selecting an account does not edit its binding.
- Existing Local accounts trigger Local ensure/check only after selection.
- Add-account starts the first-login provider flow.

## 6. State machine

### 6.1 Top-level states

```text
BOOT
  -> LOAD_REMEMBERED_BINDINGS
  -> BACKGROUND_LOCAL_PROBE
  -> SHOW_ENTRY
```

`BACKGROUND_LOCAL_PROBE` must not start xpod. It may read cached status and do a
light reachability check.

### 6.2 First-login flow

```text
SHOW_ENTRY
  -> SELECT_PROVIDER

SELECT_PROVIDER undefineds
  -> SELECT_UNDEFINEDS_DATA_SPACE
  -> CONTINUE

SELECT_PROVIDER non-undefineds
  -> START_AUTH
  -> WAIT_CALLBACK
  -> VERIFY_PROVIDER_DEFAULT_BINDING
  -> ENTER_APP
```

Undefineds Cloud:

```text
CONTINUE cloud
  -> START_AUTH
  -> WAIT_CALLBACK
  -> VERIFY_CLOUD_BINDING
  -> ENTER_APP
```

Undefineds Local:

```text
CONTINUE local
  -> PREPARE_LOCAL_RUNTIME_AND_PROVISION
  -> START_AUTH_WITH_PROVISION_CODE
  -> WAIT_CALLBACK
  -> VERIFY_LOCAL_BINDING
  -> CHECK_LOCAL_REACHABILITY
  -> ENTER_APP | LOCAL_RECOVERY
```

### 6.3 Remembered-account flow

```text
SHOW_REMEMBERED_ACCOUNT
  -> CONTINUE_CLICKED

if session valid:
  -> ENSURE_BINDING_RUNTIME_IF_NEEDED
  -> VERIFY_BINDING
  -> ENTER_APP | RECOVERY

if session expired:
  -> RELOGIN
  -> WAIT_CALLBACK
  -> VERIFY_BINDING
  -> ENTER_APP | RECOVERY
```

For Local remembered bindings:

```text
ENSURE_BINDING_RUNTIME_IF_NEEDED
  -> ensure local xpod process
  -> refresh provision/status if needed
  -> do not change storage binding
```

### 6.4 Back and cancel rules

| From | Action | Result |
| --- | --- | --- |
| Other providers | Back | First login screen |
| Local preparing | Cancel | First login or remembered account screen; stop pending attempt if safe |
| Auth window open | User closes window | Clear pending transaction; return to previous modal state |
| Callback handling | Back | Not available; finish success or show error |
| Switch account | Back | Remembered account screen |
| Local recovery | Switch account | Switch account list |
| Local recovery | Open settings | Open settings, then return to recovery and refresh state |

## 7. Data and protocol contracts

### 7.1 Login intent

```ts
type LoginIntent =
  | {
      providerId: 'undefineds'
      dataSpace: 'cloud' | 'local'
    }
  | {
      providerId: string
      dataSpace: 'provider-default'
    }
```

### 7.2 Remembered account

```ts
type RememberedAccount = {
  providerId: string
  webId: string
  displayName: string
  avatarUrl?: string
  lastUsedAt: string
  sessionState: 'valid' | 'expired' | 'unknown'
  storageBinding: StorageBinding
}

type StorageBinding =
  | {
      kind: 'cloud'
      storageBaseUrl: string
    }
  | {
      kind: 'local'
      storageBaseUrl: string
      nodeId: string
    }
  | {
      kind: 'provider-default'
      storageBaseUrl?: string
    }
```

### 7.3 Local provision handoff

Before Cloud auth, Local flow may hold:

```ts
type LocalProvisionIntent = {
  nodeId: string
  spRootUrl: string
  provisionCode: string
}
```

It must not claim final user Pod URL until Cloud has authenticated the user and
created/selected the Pod.

After callback, the authoritative binding is:

```ts
type LocalStorageBinding = {
  kind: 'local'
  webId: string
  storageBaseUrl: string
  nodeId: string
}
```

Validation rules:

1. `provisionCode` must decode and verify.
2. The Cloud/WebID storage discovered after login must match the expected Local
   storage root and selected binding.
3. A mismatch is a blocking security error.
4. Do not rewrite storage identity to localhost/LAN/tunnel access routes.

## 8. Share link and QR interaction contract

This spec only defines the login-adjacent contract. The full share UI can live
in a separate share feature spec.

### 8.1 Entry points after login

Share entry points may appear on:

- chat/thread/resource actions,
- file/context menus,
- contact/resource detail panes,
- mobile or desktop share sheets.

The login modal itself must not include share controls.

### 8.2 Share preview copy

Cloud-backed resource:

```text
分享链接
拥有权限的人可通过链接访问。
[复制链接] [二维码]
```

Local-backed resource:

```text
分享链接
这是本机空间里的内容。你的本机空间在线时，对方才能访问。
[复制链接] [二维码]
```

### 8.3 Local availability hint

Local share generation must not require a live network probe. The owner may be
on a laptop, behind a tunnel that is reconnecting, or sharing while offline.
Blocking on a probe would make the share action feel unreliable.

Use last heartbeat only as a weak display hint:

- recent heartbeat: `本机空间最近在线。对方访问时仍需保持在线。`
- stale or unknown heartbeat: `本机空间可能离线。链接仍可创建，对方打开时会再次检测。`

Recipient-side access is the real check: opening the canonical URL either loads
the resource, shows login/permission flow, or shows `对方的本机空间暂时不可访问`.

### 8.4 QR requirements

1. QR encodes the same canonical share URL as `复制链接`.
2. QR modal must show the storage type label:
   - `云端空间`
   - `本机空间`
3. Local QR modal must show a one-line availability hint.
4. QR must not encode bearer tokens, provision codes, or session data.

### 8.5 Permission requirements

1. Share creation writes authorization state to the owner storage.
2. The owner can choose at minimum:
   - `仅查看`
   - `可编辑` when supported by the resource type
3. Recipient access uses recipient identity/session.
4. If recipient is not authorized, show an access request or login prompt, not a
   leaked resource preview.
5. For Local shares, if the owner SP is offline, show offline state instead of
   permission failure.

## 9. Component boundaries

Follow `docs/ui-component-architecture.md`.

Recommended split:

- `LoginModalShell`: pure UI shell, fixed compact dimensions.
- `RememberedAccountCard`: pure UI for avatar/account/binding.
- `FirstLoginChoice`: pure UI for undefineds data-space choice and provider entry.
- `ProviderList`: pure UI for account providers.
- `LoginProgressState`: pure UI for one-line operation states.
- `LoginErrorState`: pure UI for recovery actions.
- `useLoginController` / existing controller: owns state machine, local startup,
  transaction persistence, auth handoff, and binding verification.

Do not put xpod startup, collection writes, or Solid profile parsing inside pure
UI components.

## 10. Copy rules

Preferred terms:

| Use | Avoid in login modal |
| --- | --- |
| `undefineds 账号` | `OIDC issuer` |
| `云端空间` | `Cloud SP` |
| `本机空间` | `Local SP`, `xpod storage provider` |
| `继续使用 Alice` | `Login with selected provider` |
| `本机空间暂时不可用` | raw node/port/provision errors |
| `切换账号` | `Change issuer` |

The login modal may use `Local` only as a small technical label if the rest of
the surrounding copy uses `本机空间`. Prefer Chinese product copy for primary
text.

## 11. Acceptance criteria

### UX and visual

- Login modal width is 360-400 px on desktop.
- Normal remembered-account state contains: brand, avatar, name, binding label,
  primary action, switch-account action. Nothing else.
- First undefineds login contains: brand, provider label, Cloud/Local segment,
  primary action, other-provider action.
- No login state exposes IDP/SP/provisionCode/nodeId/token/storage URL.
- Loading state uses one operation sentence and one optional detail line.
- Error state offers clear actions without silently switching storage.
- Avatar appears for all remembered accounts and switch-account rows, with a
  deterministic fallback.

### Protocol

- Undefineds Local first-login obtains a valid `provisionCode` before Cloud auth.
- Cloud Pod creation with Local intent sends `settings.provisionCode`.
- `ProvisionPodCreator` branches only on valid `settings.provisionCode`.
- Local SP creates the Pod and writes `solid:storage` for the Cloud WebID to the
  Local Pod URL.
- Login callback verifies the selected storage binding before app entry.
- Remembered Local account continue does not ask the user to choose Cloud/Local.
- Third-party provider continue does not display Cloud/Local selection.

### Sharing

- Cloud and Local resources can generate share links.
- Cloud and Local resources can generate QR codes.
- Local share UI uses last heartbeat only as a non-blocking hint; recipient-side open is the real availability check.
- QR/link never include bearer tokens, service tokens, provision codes, or raw
  session data.
- Recipient access uses recipient identity and storage authorization checks.

### Tests

- Unit/component tests for compact modal states and absence of technical terms.
- State-machine tests for first login, remembered account, relogin, switch
  account, back/cancel, and Local failure.
- Integration tests for Local registration: provision code -> Cloud Pod create ->
  Local `/provision/pods` -> WebID `solid:storage`.
- Integration tests for storage mismatch fail-closed.
- Share tests verifying canonical URL generation for Cloud and Local and that
  QR payload equals share URL.

## 12. Resolved decisions

No blocking product issue remains for the login modal.

1. Third-party provider catalog is intentionally not shipped in the compact
   modal; only existing configured providers and `添加供应商` appear.
2. Share links are canonical resource URLs. QR encodes the same canonical URL
   and must not contain credentials.
3. Local share UI uses last heartbeat as a non-blocking hint and never blocks
   link/QR generation on a live probe. Recipients still verify availability by
   actually opening the canonical URL.
