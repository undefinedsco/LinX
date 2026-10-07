# Login Modal and Local Binding Spec

- Status: Draft for implementation
- Last updated: 2026-09-28 (R6 design alignment; implementation not verified)
- Owner surface: LinX desktop/web login, remembered account card, Local startup handoff, Cloud account consent handoff
- Related docs:
  - `DESIGN.md`
  - `docs/ui-style-guide.md`
  - `docs/ui-component-architecture.md`
  - `docs/login-identity-storage-routing-model.md`
  - `docs/local-sp-domain-and-tunnel.md`

R6 authority: [joint product experience](../../homepage/docs/specs/personal-ai-product-experience-r6.md); LS-09/10/11/13. Registration, Consent and explicit Pod creation follow the [Xpod login/host canonical](../../xpod/docs/superpowers/specs/2026-09-19-xpod-login-and-host-design.md), first part §0/§3.3 and second part §4.1–4.2; it supersedes this document’s former implicit-create sequence. This remains the compact login and binding contract. `login-experience-map.md` is a route index and historical record, not authority for three equal first-screen choices.

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
- Registration creates only an Account. A user with no Pod can reach account/Pod management; login and Consent do not prepare or create a Pod.
- Only explicit Local Pod creation uses the Cloud-signed `provisionCode` target proof; account login, a selected Local preference and a client-supplied SP URL are not creation authority.

## 2. Terms

| Term | Product meaning | UI exposure |
| --- | --- | --- |
| Account provider | Where the user signs in. `undefineds` is the default; third-party providers are advanced login providers configured by users who know what they are doing. | Show `undefineds` and existing configured providers only. Do not ship a default catalog of provider brands in the compact login modal. |
| Data space | Where LinX stores data. Only `undefineds` supports choosing `Cloud` or `Local`. | Shown only before first undefineds login or when adding a new undefineds binding. |
| Storage binding | The post-login binding between WebID and actual storage base. | Shown as a short label such as `undefineds · 本机空间`; not editable inline. |
| Local SP | The local xpod storage provider. | Not named in login UI. Use `本机空间`. |
| provisionCode | Cloud-signed proof that a Local SP is the intended target of an explicit Pod creation operation. Not permission to create during login/Consent. | Never shown in login UI or logged in full; diagnostics show only presence/status. |

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
| First undefineds Local login | Preserve Local as intended storage target and complete Account login/registration; do not invoke Local prepare or create. | Account/Pod management if there is no usable Pod; an unavailable inventory is an error, not an empty list. |
| Explicit Local Pod creation in management | User selects a manageable machine, validates conditions and explicitly starts the service if required, then confirms creation under the canonical lifecycle contract. | Creation/task state in management; it is not a login loading stage. |
| Callback completed | Verify storage binding and reachability. | Enter app or show Local recovery. |
| In-app runtime loss | Keep account session, show runtime connectivity problem. | Do not logout or silently switch to Cloud. |

Using an existing Local binding requires its runtime to be reachable. Account login/registration and merely opening the dialog do not run Local provisioning prepare. Existing-binding runtime access and explicit Pod creation are separate operations.

### 3.4 Account, Consent and explicit Pod creation

The Xpod canonical separates Account registration, WebID authorization and Pod readiness. Local selection in the compact modal records an intended target; it does not submit provisioning.

```text
User chooses undefineds + Local
  -> Account login / registration (registration creates Account only)
  -> Read authoritative Pod inventory / applicable bindings
  -> Existing usable Pod: select/verify it and continue authorization
  -> Confirmed no usable Pod: go to Account / Pod management
       -> user explicitly chooses the Local target machine
       -> validate management authority and storage conditions
       -> if needed, user explicitly starts Xpod and health is checked
       -> user confirms Create Pod
       -> existing Local creation flow validates the Cloud-signed provisionCode
       -> creation task submits to the selected Local SP
       -> read authoritative owner / WebID / storage binding
       -> resume the original valid authorization interaction
  -> Callback validates the exact selected binding
```

Rules:

1. Registration, ordinary login, preflight, Consent, callback and entry into Pod management do not call Local prepare or submit Pod creation. Existing creation-task recovery is not a new submission.
2. `provisionCode` remains the Cloud-signed selected-Local target proof. The explicit creation branch validates `settings.provisionCode` through the existing creation protocol; carrying the proof through an interaction never triggers creation. Arbitrary `storageBaseUrl`, a directory name or Account presence are not authority.
3. Inventory failure is not “zero Pods”. Show unavailable/retry, do not offer an inferred empty-state creation as recovery or auto-create a replacement. Missing owner/conflicting binding has its own repair path under the canonical contract.
4. Before authoritative creation/selection, do not invent a final `/<username>/` Pod URL. Read exact owner/WebID/storage facts after the explicit operation, then validate the selected binding before business access.
5. Account registration success and Pod creation failure are separate results. A failed Local creation leaves the Account result intact, shows the original creation task and targeted recovery, and never falls back to Cloud storage.
6. Timeout, lost callback or unknown creation result first queries the original task and authoritative inventory. Refresh, repeated click and cross-tab return must not submit another creation or roll back a server-side success.
7. No usable Pod during application authorization offers “前往 Pod 管理” and “取消授权”. Preserve bounded continuation tied to the Account and original interaction; after return re-read bindings and health. Account change or expired interaction restarts authorization, never reuses the old identity or an unchecked return URL.
8. Cancel waiting is not cancellation of a submitted task. Canceling authorization uses the existing protocol return path and does not undo Account registration or an already-created Pod.

### 3.5 Advanced Standalone and configured providers

The compact default stays provider-first with undefineds Cloud/Local choice. A visible secondary “其他登录方式” entrance exposes configured providers and “本机独立空间” when the deployed runtime supports Standalone. Standalone is not an automatic fallback after Local failure and is not a third equal default tab.

Explain the difference before continuing: Local uses an undefineds Cloud identity and local storage; Standalone uses local identity, authorization and storage under its existing identity contract. Retain a clear return to the compact entrance. If this capability is unavailable in a release, identify the missing capability rather than displaying a working-looking login action.

The existing provider-default branch and identity/storage routing authority govern the protocol; this product entrance does not invent a new `LoginIntent` variant or weaken binding checks. Any necessary mapping must be specified and tested by the identity owner before release.

## 4. Dialog size and visual constraints

The login modal should be comparable to a WeChat desktop login panel: compact,
centered, and focused on one decision or one account.

Target desktop size:

```text
Width: 360-400 px
Default height: 420-500 px
Default max height: 560 px before internal scrolling; narrow/200% text layouts adapt to available viewport
Corner radius: 18-20 px
Padding: 28-32 px outer, 16-20 px internal groups
Primary button hit area: at least 44 px
```

Visual rules:

1. Use neutral card surface, subtle border, shallow shadow.
2. Use system typography.
3. Use LinX purple only for the primary action, selected segment, and focus.
4. Avoid gradients, glow, emoji, large marketing titles, and dense technical
   tables.
5. Use visible text status, not color-only dots.
6. Advanced configuration belongs in Settings or the explicit advanced login path, not the primary decision. Standalone remains discoverable as specified in section 3.5.
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
│        其他登录方式                 │
│                                    │
└────────────────────────────────────┘
```

Copy:

- `云端`: `资料保存在云端`
- `本机`: `资料保存在这台电脑；使用 undefineds 账号登录`

Show the copy as short helper text under the segment; allow two lines for Local identity/storage clarity instead of clipping it.

### 5.2 Other login methods

The compact modal does not provide a default third-party provider catalog. It
lists configured providers and an advanced add action. The same secondary surface includes the supported Standalone entry from section 3.5, clearly separated from account providers.

No default rows such as Google, GitHub, or enterprise SSO should appear unless
the user has configured them.

```text
┌────────────────────────────────────┐
│  其他登录方式                       │
├────────────────────────────────────┤
│  undefineds                        │
│  支持云端空间和本机空间              │
│                                    │
│  Acme SSO                          │
│  已配置                             │
│                                    │
│  + 添加供应商                       │
│  本机独立空间（可用时）               │
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

### 5.7 Existing Local binding: runtime access

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

`正在创建本机空间` belongs only to an explicitly submitted creation task in Pod management. It is not a login/Consent detail line. This screen is for accessing an existing binding, not preparing a new Pod.

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

Undefineds Cloud or Local (page-flow labels, not new authentication states):

```text
CONTINUE selected storage intent
  -> ACCOUNT_LOGIN_OR_REGISTER
  -> READ_AUTHORITATIVE_INVENTORY
       -> unavailable: INVENTORY_RECOVERY (no prepare/create)
       -> usable binding: SELECT_AND_VERIFY_BINDING -> CONTINUE_AUTHORIZATION
       -> confirmed no usable Pod: ACCOUNT_POD_MANAGEMENT
            -> explicit user Create Pod -> existing creation operation
            -> read authoritative binding -> resume valid authorization
  -> WAIT_CALLBACK
  -> VERIFY_SELECTED_BINDING
  -> CHECK_REACHABILITY
  -> ENTER_APP | BINDING_RECOVERY
```

Registration success can remain at Account/Pod management with zero Pods. A Pod-backed LinX work surface still requires the selected WebID/storage authorization. Cloud/Local selection does not auto-create or authorize machine control; Local `provisionCode` is consumed only by explicit creation under section 3.4. No new authentication state or creation protocol is defined here.

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
  -> read existing runtime/binding status; do not run Local prepare or create
  -> do not change storage binding
```

### 6.4 Back and cancel rules

| From | Action | Result |
| --- | --- | --- |
| Other login methods | Back | Previous compact login screen |
| Existing Local binding runtime check | Cancel | First login or remembered account screen; stop pending attempt if safe |
| Auth window open | User closes window | Clear pending transaction; return to previous modal state |
| Callback handling | Back | Do not interrupt a binding mutation blindly; show the actual step, then success or bounded recovery. Unknown result is checked against the original attempt, not resubmitted |
| Switch account | Back | Remembered account screen |
| Local recovery | Switch account | Switch account list |
| Local recovery | Open settings | Open settings, then return to recovery and refresh state |

### 6.5 Enter app is not “everything ready”

`ENTER_APP` follows a verified identity/storage binding. It does not assert Pod write readiness, successful Secretary initialization, a connected model or a trained personal model. If the selected space is unavailable, recovery may show account/repair controls and only previously authorized data allowed by the existing access/cache contract; it must not invent offline read authority.

| Fact | User-visible effect | Recovery |
|---|---|---|
| Identity or binding unverified/mismatch | No business writes and no restored private content | Original account/binding recovery; never Cloud fallback |
| Binding valid, space inaccessible | Specific space state and repair; do not label all data deleted | Retry the same space, preserve legal return |
| Space readable, write not ready | Available reading remains usable; dependent saves explain why blocked | Refresh actual write capability; do not fake saved drafts |
| Assistant bootstrap incomplete | Existing permitted resources remain available; AI start waits with a reason | Resume existing initialization, do not duplicate the assistant |
| AI connection missing/failed | Show connection repair only when needed | Return to the same work; no silent provider rotation |
| No personal model | Normal untrained state; methods and supported knowledge use remain available | No mandatory training step or global warning |

First use with no context enters Work; returning users restore their last legal module/object under the verified identity and space. Login must not overwrite a saved source/method/evaluation context by forcing Chat.

### 6.6 Switching, drafts and accessible recovery

Before a deliberate switch/logout, unsaved method, material or evaluation edits offer save/discard/continue editing. Save failure preserves the edit. Once switching begins, hide old private content and stop its UI subscriptions; drafts and return points are isolated by identity and space. Late results never render in the next identity. See [Profile/Settings](prototype/module-profile-settings.md).

Closing the auth window or canceling an existing Local binding runtime check cancels the pending UI attempt only to the extent confirmed by the controller; it does not assert that already submitted provisioning or other remote work stopped. Unknown outcomes query the original attempt before retrying. Callback handling has visible progress and a recoverable timeout/error state, never an indefinite disabled screen.

All choices/actions support keyboard and clear focus; modals return focus to their trigger. Errors are associated with the affected action. At 390px and 200% text the modal can grow/scroll within the viewport without clipping the primary or recovery actions. Deterministic avatar fallback is display-name initial, then a neutral person icon, shared with Settings.

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

An explicit Local creation operation may hold the existing selected-target proof below. Login may carry an already valid context for later continuation, but must not obtain it by running provisioning prepare as an automatic login precondition:

```ts
type LocalProvisionIntent = {
  nodeId: string
  spRootUrl: string
  provisionCode: string
}
```

This intent is not a creation request and does not identify a final user Pod. Only authoritative selection of an existing Pod or completion of a user-confirmed creation supplies the concrete owner/WebID/storage facts. A registration/Consent callback alone does not imply creation.

After authoritative binding selection/creation and authorization, callback validation uses the existing binding shape:

```ts
type LocalStorageBinding = {
  kind: 'local'
  webId: string
  storageBaseUrl: string
  nodeId: string
}
```

Validation rules:

1. The explicit Local creation path must decode and verify `provisionCode`; ordinary login/Consent does not require a new creation proof and does not call prepare/create.
2. The Cloud/WebID storage discovered after authorization must match the expected Local
   storage root and selected binding.
3. A mismatch is a blocking security error.
4. Do not rewrite storage identity to localhost/LAN/tunnel access routes.
5. Inventory unreadable, confirmed empty and binding conflict are distinct. Unknown creation results resume/query the original operation before any new submission; Account success is not reverted by storage failure.

### 7.4 Local access profile switching

Local network settings may keep multiple access profiles, including public direct,
LAN, localhost, Cloudflare Tunnel, Sakura/frp, ngrok, or P2P fallback. These
profiles are operational routes, not storage identities. Only one profile can be
active at a time.

Switching the active profile must:

1. preserve the canonical storage URL and WebID binding;
2. stop the previously active tunnel client before starting the selected profile;
3. update `activeTunnelId` / active access profile metadata;
4. run or schedule same-node reachability validation;
5. never silently switch to Cloud storage when the selected profile fails.

## 8. Component boundaries

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

## 9. Copy rules

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

## 10. Acceptance criteria

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

- Advanced Standalone is discoverable when supported, correctly distinguished from Local, and never selected as error fallback.
- Space copy describes storage; “同步” is used only when an actual synchronization capability is being described.
- Keyboard, focus return, 390px width and 200% text retain all main/recovery actions.
- First use can proceed without a personal model; returning users resume the last legal context.
- Partial readiness and targeted retry do not duplicate the default assistant or hide available permitted reading.
- Account switch isolates drafts, references and late subscriptions; logout does not report remote tasks stopped.

### Protocol

- New Cloud/Local/Standalone accounts can complete Account registration with zero Pods. Registration/login/Consent/callback perform zero Local prepare and zero Pod-create calls.
- A confirmed no-Pod state goes to Account/Pod management; merely entering management does not create. Inventory failure is not interpreted as empty and does not trigger creation.
- Only explicit user-confirmed Local creation sends the existing `settings.provisionCode`; the creation branch validates it and writes authoritative owner/storage facts through the existing protocol. Possession of the code does not trigger the operation.
- Account registration success remains success when Local creation fails; creation error and its original task are shown separately, without Cloud fallback.
- A lost response or unknown result queries the original creation task and authoritative inventory first. Reload/repeated click/cross-tab return does not create duplicates.
- After management, authorization resumes only for the still-valid Account/interaction; changed Account or expired interaction restarts authorization.
- Login callback verifies the selected storage binding before app entry.
- Remembered Local account continue does not ask the user to choose Cloud/Local.
- Third-party provider continue does not display Cloud/Local selection.

### Tests

- Unit/component tests for compact modal states and absence of technical terms.
- State-machine tests for first login, remembered account, relogin, switch
  account, back/cancel, and Local failure.
- Integration tests split Account registration with zero Pods from explicit Pod management creation, and then authorization continuation. Assert zero prepare/create calls in login/registration/Consent and management entry.
- Explicit Local creation tests verify the existing provision-code path, authoritative owner/storage, inventory unavailable vs empty, failure isolation and unknown-result recovery without duplicate submission.
- Integration tests for storage mismatch fail-closed.

## 11. Resolved decisions

The compact provider/binding decisions below are settled. R6 does not claim runtime readiness. Standalone entrance mapping, partial-readiness facts, identity-isolated draft restoration and unknown-outcome recovery require implementation evidence under the existing identity contracts.

1. Third-party provider catalog is intentionally not shipped in the compact
   modal; only existing configured providers and `添加供应商` appear.
