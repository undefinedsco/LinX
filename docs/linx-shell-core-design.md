# LinX Shell / Core Design

This document defines the LinX shell/core boundary. It is a modeling document:
it states ownership, authority, and lifecycle invariants. Feature-specific command
behavior belongs in the feature contract docs.

## Goal

LinX has one product core with multiple shells. The CLI/TUI shell may adapt Pi,
Codex, ACP, xpod, and terminal behavior, but it must not become a second product
core or a competing source of business truth.

The practical rule is:

```text
shell event / command / key
  -> shell lifecycle and command routing
  -> shared runtime or shared model use-case
  -> local runtime action or Pod-backed data action
  -> shell rendering
```

The shell owns interaction and process lifecycle. The core owns durable semantics.

## Ownership

| Layer | Owns | Must not own |
| --- | --- | --- |
| Shell lifecycle | TTY raw-mode handoff, foreground process ownership, restart/exit, signal/escape wiring, terminal cleanup | Pod resource identity, backend credential semantics, approval policy |
| Shell command router | Parsing CLI/TUI commands, dispatching to shell-owned handlers or forwarding backend-native commands | Duplicating backend command languages, creating alternate shared state machines |
| Shell rendering | Footer/status line, selectors, login/update dialogs, error display, terminal text | Durable business state, provider aliases, resource paths |
| Runtime projection | Model-only prompt wrappers, Secretary/worker routing instructions, xpod/tool guardrails, bounded steering deltas | Product Message content, visible TUI transcript, long-lived control truth |
| Runtime adapters | Translating Pi/Codex/ACP/Claude events into shared DTOs; spawning and supervising local runtimes | Shared RDF predicates, subject templates, credential source of truth |
| Shared core/models | Domain objects, Pod schemas/repositories, runtime contracts, auth/status normalization, backend capability contracts | TTY rendering, process handles, keyboard shortcuts, raw terminal state |

## Shell lifecycle invariants

The CLI shell is responsible for terminal ownership. Any code that starts,
stops, restarts, or replaces an interactive process must preserve these
invariants:

1. **One foreground owner:** do not let the parent shell regain the terminal while
   a replacement TUI process is initializing raw mode.
2. **Stop before replace:** release the old TUI before spawning a replacement
   process.
3. **No fire-and-forget restarts:** in-TUI self-update must keep the current Node
   process alive until the replacement process exits or fails.
4. **Exit output is lifecycle-aware:** normal user exit may print resume/token
   information; self-update restart must suppress normal exit copy so the new TUI
   owns the visible session.
5. **Restart exit mirrors replacement exit:** the original process exits with the
   replacement process result. Signal exits map to conventional shell codes
   where possible (`SIGINT` -> `130`, `SIGTERM` -> `143`).
6. **Lifecycle is testable without a real TTY:** restart behavior must be behind a
   small injectable boundary for process spawn, process exit, and scheduling.

These invariants are shell concerns. They should not leak into branding, auth,
Pod, backend, or shared model code.

### Interactive lifecycle patch points

Pi currently exposes several shell extension points as mutable methods on the
interactive instance. LinX must treat those methods as shell-owned chokepoints,
not as feature-local patch surfaces.

Hard rules:

- `interactive.stop` is patched only by
  `apps/cli/src/lib/linx-interactive-stop-router.ts`.
  Feature modules register stop handlers with explicit phases:
  - `before`: release subscriptions, cancel auto input, and stop background
    work before Pi releases the TUI;
  - `after`: render normal-exit copy after Pi stop succeeds;
  - `finally`: restore filters and process-local cleanup even when earlier
    handlers fail.
- `interactive.setupEditorSubmitHandler` is patched only by
  `apps/cli/src/lib/linx-interactive-submit-router.ts`.
  Feature modules register ordered submit handlers instead of wrapping
  `defaultEditor.onSubmit` independently. The submit router also wraps the
  original submit callback with shell-owned turn-response bookkeeping so normal
  chat can surface a status when the queued turn or downstream model call has
  not produced content yet; feature modules must not add duplicate "no reply"
  timers.
- `interactive.init` is a post-init lifecycle seam, not a feature-local hook.
  New post-init behavior belongs behind
  `apps/cli/src/lib/linx-interactive-post-init.ts`; feature modules expose
  idempotent shell effects for that seam to call instead of wrapping
  `interactive.init` themselves. Existing direct init wrappers are migration
  debt and should not be copied.
- `interactive.run` is the TUI foreground lifecycle entry, not a feature-local
  hook. Any behavior that must happen as Pi starts running belongs behind
  `apps/cli/src/lib/linx-interactive-run-router.ts`. Feature modules may
  register idempotent run-time effects, but they must not wrap
  `interactive.run` themselves. This covers cases such as suppressing upstream
  Pi update notifications, preparing restart-aware output state, and other work
  that must execute exactly once before the foreground TUI loop takes ownership.
- Update version methods are shell package/update lifecycle, not feature-local
  Pi method replacements. `interactive.checkForNewVersion` and
  `interactive.showNewVersionNotification` are patched only by
  `apps/cli/src/lib/linx-interactive-update-router.ts`; update modules register
  ordered version-check and notification handlers. A LinX version-check handler
  that chooses to replace Pi's upstream check must return an explicit handled
  result even when no LinX update exists, so the router does not accidentally
  fall back to Pi's package/version surface.
- Update prompt/suppression bookkeeping is shell-local interaction state, not
  update-notification business state. LinX update code may decide package
  versions, selector copy, changelog opening, deferral policy, and restart
  requests, but hidden flags for "update in progress", "version check already
  scheduled", "deferred update version", and "suppress upstream Pi update"
  belong behind `apps/cli/src/lib/linx-interactive-update-state-host.ts`.
  Feature modules must not define `linx.tui.update*` symbols or index those
  fields directly on the Pi interactive object.
- Login UI methods are shell authentication UI lifecycle, not login-flow-owned
  Pi method replacements. `interactive.showOAuthSelector` and
  `interactive.showLoginDialog` are patched only by
  `apps/cli/src/lib/linx-interactive-login-ui-router.ts`; login/auth modules
  register ordered selector/dialog handlers instead of replacing Pi methods
  directly.
- Auth prompt/retry bookkeeping is shell-local interaction state, not
  login-flow business state. Login flow may decide when LinX/Solid auth is
  required, expired, cancelled, or refreshed, but hidden flags for "login in
  progress", "start login after init", "pending auth retry", "login scheduled",
  and "currently reporting auth error" belong behind
  `apps/cli/src/lib/linx-interactive-auth-state-host.ts`. Runtime auth bridge
  prompt flags are runtime-host state, not auth-state hidden fields. Feature
  modules must not define `linx.tui.auth*` symbols or index those fields
  directly on the Pi interactive object.
- Interactive event/error methods are shell event-normalization lifecycle, not
  auth-feature-owned Pi method replacements. `interactive.handleEvent` and
  `interactive.showError` are patched only by
  `apps/cli/src/lib/linx-interactive-event-router.ts`; modules that normalize
  events, intercept recoverable errors, or format visible errors register
  ordered handlers. Feature modules that only need to display an error call
  `apps/cli/src/lib/linx-interactive-error-display.ts`; they must not directly
  call `interactive.showError` or depend on Pi's visible-error field shape.
- Streaming message state is shell rendering state, not auth recovery state.
  Reads/writes of `interactive.streamingComponent` and
  `interactive.streamingMessage` belong behind
  `apps/cli/src/lib/linx-interactive-streaming-message-host.ts`; features may
  request streaming cleanup but must not know Pi's mutable streaming field
  layout.
- Custom header replacement and invalidation are shell rendering state, not
  welcome-card business logic. Writes to `interactive.customHeader` and
  follow-up render requests for header state changes belong behind
  `apps/cli/src/lib/linx-interactive-header-host.ts`; welcome or startup modules
  may build replacement components but must not know Pi's header field/container
  mutation or render invalidation details.
- Appending visible fallback text to the Pi chat transcript is shell rendering
  state, not feature business logic. Feature modules may build the notice text,
  but `Text` component creation, `interactive.chatContainer` mutation, and render
  invalidation belong behind
  `apps/cli/src/lib/linx-interactive-chat-text-host.ts`.
- Visible status copy and render invalidation are shell rendering state, not
  feature business logic. Feature modules may decide the semantic outcome they
  need to surface, but they must not call Pi `interactive.showStatus` or
  `interactive.ui.requestRender` directly. Add or use a named status/rendering
  seam so status text, footer invalidation, raw-mode timing, and render requests
  stay ordered with the rest of the shell lifecycle.
- Visible warning copy is shell rendering state, not feature business logic.
  Feature modules may classify recoverable warning conditions and provide the
  warning text, but Pi `interactive.showWarning` belongs behind
  `apps/cli/src/lib/linx-interactive-warning-display.ts`. Rewind, auto,
  Pod-backed extension context, submitted-message recording, and future
  recovery flows must route visible warnings through that seam instead of
  depending on Pi's warning method shape.
- Provider-count refresh is shell/provider rendering state, not login or
  AI-connect business logic. Login and provider credential flows may refresh the
  model registry or save credentials through shared runtime contracts, but Pi
  `interactive.updateAvailableProviderCount` belongs behind
  `apps/cli/src/lib/linx-interactive-provider-count-host.ts` so provider
  availability display stays a shell concern.
- Interactive model registry and auth storage access is shell runtime state, not
  login or AI-connect feature field knowledge. Feature modules may decide when
  to refresh providers, start LinX/Solid login, clear runtime credentials, or
  mark the LinX runtime API key as managed, but Pi's
  `interactive.session.modelRegistry` / `authStorage` shape belongs behind
  `apps/cli/src/lib/linx-interactive-model-registry-host.ts`.
- Runtime auth bridge reads/writes are shell runtime state, not welcome/login feature
  field knowledge. Feature modules may ask for the visible provider label or
  startup auth prompt state, but `linxAuthBridge` placement across
  `interactive`, `runtimeHost`, and runtime objects belongs behind
  `apps/cli/src/lib/linx-interactive-runtime-host.ts`.
- Extension input collection is shell UI state, not login or credential feature
  plumbing. Feature modules may decide what prompt text is needed, but Pi
  `interactive.showExtensionInput` belongs behind
  `apps/cli/src/lib/linx-interactive-extension-input-host.ts`; the seam must
  preserve Pi's input options such as abort signals while hiding the mutable
  interactive method shape from feature code.
- Extension selector collection is shell UI state, not login, update, or
  statusline feature plumbing. Feature modules may provide titles and option
  labels, but Pi `interactive.showExtensionSelector` belongs behind
  `apps/cli/src/lib/linx-interactive-extension-selector-host.ts`; feature
  modules normalize selected values after the shell returns the raw choice.
- Custom selector mounting is shell UI state, not rewind or statusline feature
  plumbing. Feature modules may build selector components, but Pi
  `interactive.showSelector` belongs behind
  `apps/cli/src/lib/linx-interactive-selector-host.ts`; callback lifecycle and
  focus handoff must stay on the shell side.
- Autocomplete provider patching is shell input lifecycle, not command catalog
  business logic. Command catalog modules may provide completion command
  descriptors and name extraction, but Pi `setupAutocompleteProvider`,
  `setupAutocomplete`, and `autocompleteProvider` mutation belong behind
  `apps/cli/src/lib/linx-interactive-autocomplete-host.ts`.
- Editor text mutation, focus restoration, and render invalidation are shell
  input/rendering state, not login or feature business logic. Feature modules
  may decide the desired text, but `interactive.editor.setText`,
  `interactive.ui.setFocus`, and follow-up render invalidation belong behind
  `apps/cli/src/lib/linx-interactive-editor-text-host.ts`.
- Terminal-title patching is shell rendering lifecycle, not welcome-card
  business logic. `interactive.updateTerminalTitle` is patched only by
  `apps/cli/src/lib/linx-terminal-title-router.ts`; rendering modules register
  ordered title handlers instead of replacing the Pi method directly.
- Opening an external URL is shell/host integration, not login or update feature
  logic. Feature helpers may request that a URL be opened, but Pi's
  `interactive.openExternal` method belongs behind
  `apps/cli/src/lib/linx-external-open-host.ts`; fallback OS process launching
  must stay in the shell URL helper rather than leaking terminal/process details
  into feature modules.
- Custom editor component rebinding and temporary component mounting are shell
  editor lifecycle, not feature-local wrapper territory. `interactive.setCustomEditorComponent` is patched only by
  `apps/cli/src/lib/linx-editor-component-router.ts`; modules that need to
  re-wrap the active editor after Pi swaps components register ordered rebind
  handlers. Feature modules that temporarily replace the editor with a dialog
  must also use the editor-component seam for mount, restore, focus, and render
  invalidation; they must not mutate `interactive.editorContainer` directly.
- Extension UI context creation is shell UI-context lifecycle, not a Pod feature
  patch point. `interactive.createExtensionUIContext` is patched only by
  `apps/cli/src/lib/linx-extension-ui-context-router.ts`; modules that need to
  augment extension dialogs register ordered context handlers.
- Runtime session thinking capability is a session capability seam, not
  provider-specific method replacement. `session.supportsXhighThinking` and
  `session.getAvailableThinkingLevels` are patched only by
  `apps/cli/src/lib/linx-session-thinking-capability-router.ts`; provider
  modules register capability handlers.
- Session metadata reads are shell session state, not rendering, resume-output,
  status-line, Symphony, or workspace command internals. Reads from Pi
  session-manager cwd/name/id belong behind
  `apps/cli/src/lib/linx-session-metadata.ts`. Session/runtime cwd mutation
  belongs behind `apps/cli/src/lib/linx-session-cwd-router.ts`; commands may
  resolve or request a cwd change but must not know the mutable
  Pi/runtime/session-manager field layout. Resume/exit copy, welcome/header
  rendering, status-line tokens, Pod-backed extension context, Secretary auto
  input context, and Symphony status may use session metadata, but they must
  obtain it through the seam. Feature modules pass the interactive/runtime host
  or explicit DTOs to the metadata seam; they must not extract and pass raw
  `interactive.session` as a convenience; this includes exit/resume copy,
  exit/resume token-usage reads, extension UI metadata lookups, and Symphony
  source-context resolution.
- Active session work control is shell session lifecycle, not feature command
  logic. Active session selection across `interactive` / `runtime`, checks for
  Pi session streaming/bash state, follow-up delivery option selection, session
  event subscriptions, and abort calls belong
  behind `apps/cli/src/lib/linx-session-work-control.ts`; commands such as
  `/rewind`, Escape interrupt, and auto handback may request active work to stop
  or projected input to be delivered, and controllers such as Secretary auto
  input may subscribe to active-session events. Auth recovery may ask it to
  replay a captured retry turn through Pi continue/prompt fallback. Feature
  modules should prefer interactive-level seam helpers when acting on the active
  session; they must not know Pi's `isStreaming`, `isBashRunning`, `abort`,
  `abortBash`, `subscribe`, `agent.continue`, `agent.waitForIdle`,
  command-router original `prompt` / `sendUserMessage` handlers, `deliverAs:
  followUp`, or `streamingBehavior: followUp` field/option layout.
- Session history and branch repair are shell session-history lifecycle, not
  feature-local retry logic. Reads of Pi `sessionManager` history, leaf/branch
  selection, parent-id normalization, branch restore, leaf reset, and
  active agent-message fallback reads or `agent.state.messages` rebuilds from
  `buildSessionContext()` belong behind a named session-history seam.
  Auth-expired retry, `/rewind`, auto recovery, or future command replay
  features may ask that seam to capture a retryable user turn or restore a clean
  branch, but must not directly call Pi
  `sessionManager.getLeafId()`, `getEntry()`, `getBranch()`, `getEntries()`,
  `branch()`, `resetLeaf()`, `buildSessionContext()`, or read
  `agent.state.messages`.
- New lifecycle or submit behavior must add a handler to the relevant router and
  a boundary test in `apps/cli/test/shell-core-boundary.test.mjs`.

This makes TUI ownership deterministic. Login, Symphony, backend-native slash
commands, auto/goal, self-update, exit messages, and cleanup may coexist without
depending on module import order or wrapper nesting.

## Command routing invariants

TUI command routing is shell-owned, but an interactive slash command has three
possible outcomes:

- **LinX shell commands:** commands whose behavior controls the LinX shell, for
  example `/update`, `/statusline`, `/rewind`, `/ai connect`, `/cd`, and local
  shell switches.
- **LinX-proxied backend commands:** commands that the active backend exposes
  through a LinX-owned command proxy because the shell must bridge them across a
  runtime boundary. The current narrow set is `/commands`, `/models`, `/status`,
  and `/rollback`.
- **Pi/backend native submit-path commands:** commands that already belong to
  the active TUI/backend language and should fall through to Pi's original submit
  path. Examples include `/new`, `/fork`, `/session`, `/model`, `/help`,
  `/compact`, and `/name`. LinX must not clone or proxy these just because it can
  see the slash input.

The router may parse enough to decide ownership. Once a command is backend-owned,
LinX should preserve the backend command language rather than redefining it.
When a command is Pi-native, the right action is often to not handle it at all.

The default repair path for a command complaint is therefore:

```text
is there already a Pi/backend surface?
  yes -> fix discovery, forwarding, adapter compatibility, or active-surface UI
  no  -> decide whether LinX owns durable state or a scriptable product contract
          yes -> add a LinX command at the narrowest valid surface
          no  -> do not add a command
```

Do not fix command discoverability by cloning the command into another layer.
If a user cannot find a Pi-native action, improve the TUI help/selector or
backend forwarding. If a top-level command-shaped input reaches login or starts
a chat turn, fix top-level admission. If a command is mostly interactive
configuration, keep it inside the TUI unless there is a documented
non-interactive scripting contract.

A shell command may call shared core use-cases. It must not implement its own
copy of shared business semantics. If a command needs provider config, auth
status, approval state, chat/thread/message state, or Pod resource identities, it
must use the shared model/runtime contract.

The submit router owns the first decision point for interactive user input. The
current priority order is:

```text
10 login and non-consuming Idea capture preflight
20 Symphony
40 LinX-proxied backend slash commands
50 LinX shell command fallback
original Pi submit path for unconsumed Pi/backend-native commands and messages
```

Handlers return `true` only when they consumed the input. Unknown commands,
Pi-native slash commands, and ordinary messages must fall through to the next
handler or Pi's original submit path. A handler must not call the original submit
and then also report `false`; that creates duplicate turns.

Normal chat submission may continue after pre-submit side effects such as Idea
capture. If the turn then stays silent,
`linx-interactive-turn-response-watchdog.ts` is the shell-owned status seam: it
distinguishes "message queued, no backend activity" from "backend/model call
started, no visible content yet" by watching Pi session events. This status is
local TUI feedback only; it is not persisted as chat content and does not replace
stream/cloud timeout handling.

LinX-owned TUI slash commands are never model chat. Commands such as `/update`,
`/statusline`, `/rewind`, `/ai connect`, and `/cd` must be consumed by the shell
command surface before the backend/model submit path. If the user types one of
these commands and receives a normal assistant explanation of what the command
would do, command routing failed: fix submit-router ordering, command
registration, or active-surface discovery instead of improving the prompt.

Projected command routing is also shell-owned. Auto/Secretary projected input may
contain slash commands, but feature modules must not exchange those projected
handlers through ad hoc `interactive.__linxHandle*` fields. LinX shell modules
register projected global/backend handlers in `linx-interactive-shell-state.ts`,
and callers use the shell-state projected command helper. This keeps `/auto`,
`/goal`, `/ai connect`, and backend-native slash commands on one command bridge
instead of turning the Pi interactive object into a hidden service locator.

Top-level session navigation follows Pi's native surface instead of introducing
parallel LinX-only entry points. Users list or choose sessions with `linx -r` /
`linx --resume` at startup or `/resume` inside the TUI, inspect the active
session with `/session`, and resume a known target with `linx --session
<path|id>`. LinX may pass through Pi-native session storage flags such as
`--session-dir` and `--session-id`, but must not add a separate `linx sessions`
or `--sessions` product command. Session listing is a Pi selector concern, not a
second LinX product command. If Pi changes its session selector contract, LinX
adapts to that upstream contract instead of keeping a compatibility command that
looks like a LinX product surface.

Pi-aligned command boundaries:

- Pi-native concepts keep Pi-native entry points. LinX may wrap startup, login,
  package lifecycle, and rendering, but it must not rename Pi's command
  language into a LinX-specific parallel command set.
- LinX top-level flags that expose Pi concepts must keep Pi's names and
  selector semantics. Do not invent a second vocabulary for the same runtime
  behavior.
- `--session-dir` and `--session-id` are local runtime archive selectors. They
  must not become Pod chat/thread identity, backend credential identity, or
  product data-model fields. Runtime archive identity may be displayed in shell
  resume/debug copy, but product conversations must still be addressed through
  Pod Chat/Thread resources and shared model repositories.
- Session selector conflicts must be rejected before login, Pod session lookup,
  auto hydration, or interactive bootstrap side effects. In particular, an exact
  `--session-id` target is mutually exclusive with `--session` and with
  continue/resume selection.
- Low-frequency interactive configuration belongs in the TUI command surface
  when Pi already has an interactive affordance. Do not promote those commands
  to top-level CLI entries unless they need non-interactive scripting semantics.
- Top-level LinX commands are reserved for LinX-owned package/lifecycle/product
  operations. Backend-native or Pi-native commands should be forwarded or
  adapted at the shell boundary, not cloned as parallel LinX product commands.

Native surface reuse rules:

- Treat upstream Pi/backend commands as existing product surfaces. LinX parity
  means preserving or forwarding them where the upstream surface is active, not
  re-registering them as LinX top-level aliases.
- When the upstream surface has the right concept but a broken LinX experience,
  repair the adapter seam instead of creating a LinX-owned clone. Examples:
  session listing belongs to Pi's resume selector, model switching belongs to
  backend `/model`, and interactive help belongs to the active TUI/backend help
  surface.
- A missing LinX top-level alias is not a feature gap when Pi or the active
  backend already provides the selector, slash command, or help surface. Fix
  forwarding, adapter compatibility, or active-surface discoverability instead
  of cloning the command.
- Add a LinX-owned top-level command only after naming the durable LinX state,
  package lifecycle, or scriptable contract it owns. If the command only lists,
  chooses, forks, names, compacts, or switches an upstream runtime session, it
  belongs to the Pi/backend surface.
- Hidden commands and flags are not a user workflow. They may support local
  maintainers, compatibility, or trusted machine bridges, but product docs and
  user-facing help must point at the real executable surface.
- If LinX needs a new scriptable API for something that currently exists only as
  an interactive Pi/backend selector, define that scriptable contract explicitly
  before adding a command. Do not ship a top-level clone first and retrofit the
  boundary later.

Retired surface rules:

- Removing a duplicate top-level surface is a boundary repair, not a regression,
  when the same behavior is already owned by Pi or the active backend. Remove the
  command registration, help entry, and docs together instead of keeping a hidden
  human-facing alias.
- A hidden retired command is allowed only as a narrow migration notice for a
  released LinX-owned surface. It must not perform the old behavior, start login,
  hydrate Pod state, bootstrap Pi, or become the documented workflow.
- Do not add compatibility shims for surfaces that were never LinX-owned product
  contracts. In particular, `linx sessions` and `linx --sessions` are not kept as
  hidden aliases because session listing belongs to Pi's resume selector.
- Retired command-shaped top-level input must fail during admission, before
  login, Pod lookup, auto hydration, or interactive bootstrap side effects.
  Inside the TUI, the same word may still be valid if the active backend owns the
  slash command.
- Boundary tests must cover both discoverability and side effects: top-level help
  must not list the retired surface, and admission tests must prove the retired
  command does not reach login or interactive startup.

Session inventory has three distinct meanings and must not be collapsed:

- **Human list/choose:** Pi-owned interactive selection. Use `linx -r`,
  `linx --resume`, or `/resume`; do not add `linx sessions` / `--sessions`.
- **Local archive diagnostics:** hidden maintainer inspection or repair of local
  runtime files. This is not normal session navigation and must stay out of
  user-facing help.
- **Product conversation lookup:** Pod chat/thread/message resources owned by
  shared models and repositories. These are not runtime archive sessions and
  must not be addressed with Pi session selector flags.

Top-level command admission rules:

- A top-level `linx <command>` entry must be one of:
  - LinX shell lifecycle or package management, such as login, update, local
    Pod-mirror sync, or non-interactive startup/resume selection;
  - a real non-interactive scripting surface with a documented contract;
  - a hidden retired command whose only purpose is to point users at the current
    TUI or shell surface.
- Top-level help must not advertise backend-native commands, TUI-only commands,
  or unimplemented placeholders. Examples: thread controls such as `new`,
  `fork`, `session`, `model`, and `help` belong to the active backend/TUI
  surface unless LinX has a separate implemented scripting contract for them.
  The current exception is plural `models`: `linx models` is a read-only Cloud
  `/v1/models` inspection command, not a session model switch. Singular
  `linx model` remains reserved for backend-native `/model <id>` semantics and
  must not be added as a top-level alias.
- Placeholder commands are not a product contract. Do not register a top-level
  command that only throws "not implemented". Either pass the native command
  through to the backend, implement the real LinX-owned behavior, or omit the
  entry.
- Command discovery must be scoped to the place where the command is executable:
  top-level `linx --help` shows shell/package entries; TUI command help shows
  interactive shell entries plus backend-native commands that are actually
  forwarded in that active backend.
- The default top-level prompt form, `linx [prompt..]`, must not become a
  garbage chute for command-shaped input. If the first positional token matches
  a retired command, a TUI-only command, or a backend-native command that LinX no
  longer exposes at top level, the CLI must reject it as an unknown command
  before login, Pod lookup, auto hydration, or interactive bootstrap. This keeps
  `linx sessions`, `linx fork ...`, `linx new ...`, `linx session ...`, and
  similar inputs from silently starting a chat turn.
- The command-shaped-token guard is only a top-level admission check. The same
  words remain valid where they are owned: `/new`, `/fork`, `/session`,
  `/model`, `/help`, and related backend-native commands must still pass through
  inside the interactive backend surface when that backend supports them.
- Hidden retired commands are migration shims, not new product surfaces. They
  must be hidden from top-level help, explain the current executable surface, and
  have a narrow removal/compatibility reason. Do not add a hidden command only to
  preserve an implementation shortcut.
- Hidden internal plumbing commands are allowed only when another trusted local
  process needs a stable executable bridge, for example a Codex proxy or MCP
  server launched by LinX orchestration. They must stay hidden from top-level
  help, avoid user-facing product copy, and expose only the minimal machine
  interface needed by the caller. If a human is expected to type it directly, it
  is no longer plumbing and must satisfy the normal top-level command admission
  rules.
- Hidden diagnostic and maintenance flags are allowed only for local inspection
  or repair of shell-owned archives, sync checkpoints, or compatibility state.
  They must not become discoverable session navigation, chat history browsing,
  or backend command surfaces. If the operation is meant for normal users, give
  it a visible command with a documented product contract; otherwise keep it
  hidden and narrow.

Concrete command ownership examples:

| Surface | Owns | Does not own |
| --- | --- | --- |
| Top-level CLI | `login`, package/update flows, explicit startup selectors such as `--resume`/`--session`, read-only `models` inspection, documented non-interactive scripts | backend thread controls, backend model switching, interactive help, session list clones |
| Interactive TUI shell | LinX shell controls such as `/update`, `/statusline`, `/rewind`, `/ai connect`, `/cd`, plus routing/forwarding | durable Pod semantics, duplicated backend-native command languages |
| Active backend/worker | Native commands such as `/new`, `/fork`, `/session`, `/model`, `/help` when supported by that backend | LinX package lifecycle, global credential storage, Pod resource identity |

### Active-surface parity boundary

LinX should match Pi/backend capability by preserving the surface where that
capability is executable, not by cloning every capability into every shell.
Parity means "the user can reach the upstream capability through the active
surface with LinX-specific lifecycle/auth/rendering adapted", not "there is a
top-level `linx <name>` for every TUI or backend command".

Use these rules when deciding where a capability lives:

- If the capability controls the active conversation runtime, keep the
  Pi/backend command name and expose it in the active TUI/backend help or
  selector. Examples: `/resume`, `/session`, `/model`, `/fork`, `/new`, and
  backend-native `/help`.
- If the capability configures local LinX shell rendering and is mainly
  interactive, keep the primary surface in the TUI. Add `linx config <section>`
  only when a scriptable local preference contract is useful. Do not add a
  top-level shortcut just because the command exists in the TUI.
- If the capability manages LinX package lifecycle, installation, or
  non-interactive startup selection, it may be top-level. The command name must
  describe the LinX-owned lifecycle contract rather than shadowing an upstream
  runtime command.
- If a bug appears as "the command line is weird", first identify whether the
  broken piece is admission, forwarding, active help, lifecycle handoff, or
  shell rendering. Fix that owning seam before considering a new command.

This boundary keeps the CLI shell thin: it adds LinX-owned lifecycle,
configuration, and rendering seams around Pi/backend behavior, but it does not
become a second command language for the same runtime.

### Boundary synchronization protocol

When Pi/backend design changes, or when the LinX shell/core design is updated,
the CLI must synchronize to the current ownership boundary instead of preserving
stale commands as compatibility shortcuts.

Use this protocol before changing command behavior:

1. **Refresh the current executable surface.** Check what the active Pi/backend
   already exposes now, including startup flags, TUI slash commands, selectors,
   and active help. Do not rely on older LinX aliases as evidence that LinX owns
   the capability.
2. **Name the owner before naming the command.** If the capability is runtime
   session navigation, worker conversation control, backend model switching, or
   backend-native help, the owner is Pi/backend even if the bug is visible in
   the LinX shell.
3. **Delete stale LinX duplicates instead of repairing them.** Removing a
   top-level LinX entry is correct when the current Pi/backend surface already
   owns the behavior. The fix is active-surface forwarding, help, selector
   compatibility, or lifecycle handoff, not a second LinX command.
4. **Keep help scoped to where the command runs.** Top-level help lists
   LinX-owned lifecycle/package/scriptable surfaces. TUI help lists interactive
   shell commands plus backend-native commands that are actually executable in
   the active runtime. Do not make top-level help a global command catalog.
5. **Guard admission before side effects.** Retired, TUI-only, or backend-native
   command-shaped top-level input must fail before login, Pod lookup, auto
   hydration, package update checks, or interactive bootstrap.
6. **Update docs and tests in the same slice.** A boundary change must update
   this design doc or the relevant feature contract, remove stale help/docs, and
   add or update boundary tests proving both discoverability and pre-side-effect
   admission.

The important question is not "can LinX implement this command?" but "which
surface owns the state being changed?" If the answer is Pi/backend, LinX adapts
the shell around that surface and does not create a second product contract.

### Top-level command boundary checklist

Use this checklist before adding or keeping any `linx <command>` entry:

1. **Is it LinX-owned lifecycle/package behavior?** Keep it at top level only
   when it manages LinX itself, for example login, update/install, or startup
   selection.
2. **Is it Pi/backend-native behavior?** Do not clone it. Forward it inside the
   active TUI/backend surface, or rely on Pi's native selector/command if one
   already exists.
3. **Is it low-frequency interactive configuration?** Prefer a TUI command with
   discoverable options. Do not promote it to a top-level command just because it
   is easier to implement there.
4. **Is it prompt text?** Only explicit prompt surfaces may treat
   command-shaped words as prompt text. `linx --print fork` and
   `linx exec fork ...` are prompt APIs; default `linx fork ...` is top-level
   command admission and must fail when `fork` is not a LinX top-level command.
5. **Is it a compatibility shim?** Hidden retired commands may only explain the
   replacement surface. They must not perform product behavior or appear in
   help.
6. **Is it internal plumbing?** Keep it hidden and machine-oriented. Do not use
   hidden commands as a way to ship a second human command surface.
7. **Is it diagnostic or repair-only?** Hidden flags may inspect local archives
   or retry failed sync work. They must not replace Pi session selectors, TUI
   commands, or documented scripting APIs.

Specific decisions currently in force:

- Do not add `linx sessions` or `linx --sessions`. Session listing/selection is
  Pi startup/TUI selector behavior: `linx -r`, `linx --resume`, and `/resume`.
  Removing a LinX-owned session-list command is intentional; users should not
  have to learn both `linx sessions` and Pi's resume selector for the same
  action.
- Do not keep a hidden `sessions` compatibility path for normal humans. A
  hidden path is still a second product surface if the expected caller is the
  user. Session inventory repair or migration diagnostics may exist only as
  maintainer-only archive tooling, with copy that does not present it as a way
  to choose or resume conversations.
- Do not add top-level `linx new`, `linx fork`, `linx session`, `linx model`,
  or `linx help` aliases. Those are backend/TUI command words.
- Keep `linx models` only as Cloud model-list inspection. It is plural because
  it is not the same concept as backend-native `/model <id>` switching.
- `--session`, `--session-dir`, and `--session-id` are runtime archive selectors.
  They are not Pod chat/thread IDs and must not leak into shared data models.
- Hidden archive/debug flags such as `--show`, `--sync-status`, `--sync-retry`,
  `--pi-sync-status`, and `--pi-sync-retry` are local diagnostic/repair tools.
  They must stay out of top-level help and must not be described as the way to
  browse, list, choose, or resume sessions.
- Local archive inspection and Pod mirror repair are maintainer diagnostics. If
  an operation becomes part of normal session navigation, it must move to the
  active Pi/TUI selector surface or a documented scriptable API; it must not be
  smuggled through a hidden flag.
- Pod mirror sync recovery helpers expose LinX-named retry/status DTOs and
  functions. They may match checkpoint records whose source is `pi-runtime`, but
  their public helper names must describe the LinX Pod sync repair surface.
- When a backend exposes richer native command help, expose it where the backend
  is active, not through top-level `linx --help`.




### Shell/core boundary smell checklist

Use this checklist when a CLI/TUI bug looks like "LinX command line is weird"
or "the shell/core split is unclear". A fix should repair the owning boundary
instead of adding another wrapper around the symptom.

Boundary smells:

- **Second command vocabulary:** LinX exposes a top-level command, hidden alias,
  or help entry for a Pi/backend-native concept such as session listing, thread
  forking, model switching, or native help. Repair forwarding/discovery at the
  active surface instead.
- **Command-shaped prompt leakage:** a top-level positional token that looks like
  a retired or backend-native command reaches login, Pod lookup, auto hydration,
  or chat submission. Fix admission before side effects.
- **Feature-owned Pi internals:** a feature/rendering module reads
  `sessionManager`, `interactive.__linx*`, Pi editor fields, runtime hidden
  fields, or original-method handles directly. Add or extend a named shell seam
  and a boundary test.
- **Runtime archive identity leaking upward:** code treats Pi session ids,
  session dirs, local archive paths, or resume selector state as Pod Chat,
  Thread, Contact, backend credential, or shared model identity. Keep runtime
  archive identity local to shell startup/resume/diagnostics and map product
  state through shared models.
- **Lifecycle mixed with feature logic:** update, login, auto, Symphony, rewind,
  or statusline code spawns processes, restores raw mode, patches Pi lifecycle
  methods, or decides exit copy visibility by itself. Move that behavior to the
  relevant lifecycle router/host.
- **Rendering mixed with feature logic:** auto, login, Symphony, update, or
  backend command code calls Pi status/render methods directly, appends raw
  components, or assumes footer/status layout. Move visible status text,
  transcript append, render invalidation, and focus handoff behind shell
  rendering seams.
- **Projection text leakage:** internal Secretary/Symphony prompt wrappers,
  worker-routing instructions, xpod guardrails, or tool-use policy appear as
  normal TUI transcript text or Pod Message content. Keep runtime projection in
  backend input/log surfaces and persist only visible product messages plus
  control-resource pointers.
- **Tool-layer confusion:** a raw Pod file operation succeeds but RDF/object
  parsing, query transport, or model mapping fails, and the failure is reported
  as missing login/permission. Keep xpod raw file I/O, RDF inspection, and
  modeled object access as separate layers and fix the owning package.
- **Hidden diagnostics as UX:** a hidden flag or command becomes the practical way
  to list, choose, resume, or repair normal user sessions. Either make a real
  product surface with a contract, or keep the diagnostic narrow and
  maintainer-only.

Preferred repair order:

```text
1. Identify the owning surface: top-level shell, interactive shell, active backend,
   runtime adapter, shared model, or local archive diagnostic.
2. If Pi/backend already owns the concept, preserve that surface and fix LinX's
   adapter, forwarding, help, selector, or admission behavior.
3. If LinX owns the concept, add the narrowest shell seam or shared use-case; do
   not let feature modules patch Pi internals directly.
4. Add a boundary test that would fail if the same smell returns.
5. Update this design doc in the same change.
```

### CLI startup composition boundary

The default `linx` entry is a shell composition surface. It may connect command
line parsing, startup preflight, runtime adapter construction, and Pi execution,
but it must not own the long-lived runtime decisions themselves. Keep the
startup path split by responsibility:

| Module boundary | Owns | Must not own |
| --- | --- | --- |
| CLI app entry | Registers command descriptors and global help shape | Pi adapter imports, hidden bridge internals, package manager implementation |
| Pi command orchestration | Orders admission, startup planning, adapter creation, and runtime execution | Login decision logic, Pod session lookup, session manager construction, runtime bootstrap details |
| Admission modules | Reject or route command-line shapes before side effects | Interactive rendering, Pod mutations, backend runtime startup |
| Startup plan module | Computes startup login prompt, Pod data session source, session manager, startup control state, restore-auto hydration, and adapter/runtime option inputs | TTY lifecycle, process spawn/stop, shell rendering |
| Runtime execution module | Runs print mode or interactive Pi runtime, hosts Pod mirror runtime, performs login-prompt handoff, and cleans up through restart-aware lifecycle hooks | Command admission policy, Cloud/account URL policy, shared Pod resource semantics |
| Runtime adapter factory | Wires the active backend adapter from explicit startup options | CLI command parsing, user-facing help, session selector UI |

The CLI app entry is product-facing composition code. It may import the default
Pi/TUI command orchestration module, but the command descriptor it registers for
`linx` itself, plus the factory, runner, builder, guard, and argv types that
compose that default descriptor, must be named as default LinX command surfaces,
not as Pi command surfaces.
The runtime execution module may call Pi runtime primitives such as print mode,
but its public adapter contract and CLI runtime runner/factory names are LinX CLI
surfaces. Do not name those exported contracts as "for Pi command" when the CLI
app consumes them as the default LinX runtime path.
The startup plan module has the same rule: exported plan args, plan DTO, factory,
and selector guard names describe the LinX CLI startup path, even when the plan
still creates a Pi session manager underneath.
The session-manager module is a runtime archive bridge. Its exported factory,
list, resolve, selector-guard, and Pod recovery source names should use
runtime/Pod vocabulary (`createLinxRuntimeSessionManager`,
`listLinxRuntimeSessions`, `resolveLinxRuntimeSession`,
`createNativeLinxPodSessionSource`). Pi naming is reserved for the upstream
`SessionManager` type and private archive facts that genuinely describe the Pi
runtime implementation.
Shell/runtime helper exports follow the same rule. Theme installation,
runtime coding tools, Solid app-local config paths, and runtime archive repair
helpers should use LinX/runtime names (`ensureLinxTheme`,
`createLinxRuntimeCodingTools`, `getSolidLinxWebAccessConfigPath`,
`repairDanglingLinxRuntimeToolCalls`). Do not keep `LinxPi*` names merely
because the helper is later consumed by a Pi adapter or by the `pi-web-access`
package.
Startup control-state helpers are LinX control-plane surfaces. Their exported
hydration, derivation, and resolver names should not carry Pi naming just because
the restored state is applied to the local Pi runtime session.
Resume CLI admission is also a LinX CLI surface. It may invoke the Pi/TUI session
selector UI underneath, but the admission helper/types used by the default
command module should use LinX resume names.

Startup side-effect ordering is part of the boundary:

1. Reject conflicting or retired command shapes before login, Pod session lookup,
   auto hydration, or interactive bootstrap.
2. Run command-specific admission such as auto/backend routing and hidden Pod
   mirror diagnostics before constructing the interactive runtime.
3. Resolve the startup login prompt before session manager/control-state
   hydration.
4. Hydrate Pod-backed startup state only when the launch mode can safely use it;
   print mode and explicit startup login prompts must not do hidden hydration.
5. Build adapter/runtime options as data, then pass them into the runtime
   execution boundary.

Authentication gates are launch-mode-specific:

- Interactive TUI startup must not fail only because no LinX/Solid login is
  currently available. The shell should enter the TUI, keep input responsive, and
  expose `/login` plus the normal login selector/status flow from inside the
  interactive surface.
- Non-interactive surfaces that must access Cloud or Pod before they can produce
  a result may fail before runtime execution. Examples include `--print` and
  scriptable commands that require an authenticated Pod read/write. Their error
  copy should point at `linx login` because there is no interactive TUI available
  to collect credentials.
- Startup planning may compute a pending login prompt for interactive mode, but
  that prompt is shell state. It must not be confused with command admission, and
  it must not block Pi/TUI bootstrap.
- If a missing-login path unexpectedly prevents interactive bootstrap, fix the
  startup-plan/runtime-execution split. Do not work around it by adding a second
  top-level login or resume command.

Startup control-state hydration is a core/Pod read, not a Pi archive adapter. It
should consume an explicit archive identity DTO from the startup plan: session
id and created-at time. The startup plan may derive that DTO from Pi's session
manager because it owns session archive selection for launch; the hydration
module must not call Pi `sessionManager` getters or accept a manager-like
object. If hydration needs more archive facts later, add fields to the DTO in
the startup plan instead of widening startup control back to Pi internals.

Runtime execution also consumes archive identity as startup data. It may pass
the Pi `sessionManager` into the runtime adapter or Pod mirror host because
those are archive bridge boundaries, but it must not re-derive checkpoint ids by
calling Pi getters itself. Startup planning is the single place that translates
selected Pi archive state into the DTO used by control hydration and runtime
checkpoint wiring. This keeps local runtime archive identity from drifting into
Pod Chat/Thread/Contact, backend credential, or shared model identity.

The command module may sequence these boundaries, but it should stay thin. When
new startup behavior needs login state, Pod session state, account base URLs,
session archive selectors, restore-auto state, or agent directory details, put
that behavior in the startup plan or a narrower dependency module rather than
adding another branch to the command orchestrator.

### Top-level config namespace

`linx config` is the only top-level shell configuration namespace. It exists for
scriptable, app-local settings that must be inspectable or editable outside an
active TUI. Individual sections are owned by their feature modules, but the
namespace owner is the CLI shell.

Current rules:

- Keep section behavior under `linx config <section>` when it is a LinX shell
  setting. Example: `linx config status-line ...` configures the local TUI
  footer/status line.
- Do not promote section names to top-level commands. `linx status-line`,
  `linx statusline`, and `linx footer` are not product commands; the interactive
  equivalent is `/statusline`.
- The module that registers the top-level `config` command should be named as a
  shell config owner, not as one section. Section modules may export section
  descriptors or handlers, but they should not own the top-level config command.
- Config commands may persist local shell preferences under `LINX_HOME`. They
  must not become a second source of truth for Pod resources, credentials,
  backend model selection, or session identity. Those belong to their shared
  runtime/model contracts.
- If a setting is primarily interactive and Pi already has an affordance, prefer
  a TUI slash command or selector. Add non-interactive `linx config` coverage
  only when scripting, diagnostics, or reproducible local setup need it.

The status line/footer decision is the canonical example:

- `/statusline` is the normal interactive configuration surface because users
  need to see available footer tokens and toggle them in context.
- `linx config status-line ...` may exist for scriptable app-local preferences.
- `linx statusline`, `linx status-line`, and `linx footer` must not be added as
  top-level shortcuts; they create a second command vocabulary for the same
  shell setting.
- Auto/Symphony mode visibility belongs in the footer/status line. The LinX
  interactive shell must not decorate or replace Pi's main editor frame to show
  ownership state; Pi owns the composer/editor and LinX owns status rendering.

### Resume and exit-output boundary

Normal exit copy is shell rendering, not Pi product copy.
`linx-resume-output.ts` owns visible session-closed/token/resume text, but it
only formats data supplied by shell seams. It must not read Pi session-manager
fields directly, and it must not print upstream `pi ...` resume commands from a
LinX process. The visible resume command should use the current LinX executable
surface, for example `linx --session <id>` when the selector target is a runtime
session id.

Exit output has lifecycle constraints:

- normal user exit may print session/token/resume copy;
- in-TUI self-update restart must suppress normal exit copy for the abandoned
  shell instance;
- restart failures may print a lifecycle error, but must not also print stale
  resume instructions from the old process;
- session id/name/cwd values used by exit copy are read-only runtime metadata,
  not Pod conversation identity.

### Shell rendering boundary

Rendering is an output adapter, not the place where feature state is decided.
Feature modules may compute user-facing copy, but the mechanics of showing that
copy in Pi's TUI belong to shell rendering seams. This includes status text,
error text, footer/status-line invalidation, chat-transcript append, temporary
dialog/editor mounting, focus restoration, terminal title changes, and explicit
render requests.

Do not scatter calls to Pi fields such as `showStatus`, `showError`,
`chatContainer`, `editorContainer`, `ui.setFocus`, or `ui.requestRender` through
feature modules. If a feature needs a new rendering operation, first add a
narrow shell host/router and a boundary test, then call that seam from the
feature.

Status rendering is intentionally not a product message or durable control
record. Command handlers such as auto, Symphony, update, rewind, login, and
backend command routing may choose the semantic status copy they want to
surface, but they must hand that copy to the shell status seam. The seam owns
Pi's `showStatus` call, render invalidation, footer refresh timing, and
render-only requests. This applies equally to synchronous command responses
(`/symphony on`, `/symphony status`, `/auto off`) and asynchronous background
results such as handoff completion, cancellation, or failure notices.

If an operation also changes durable state, write that state through the shared
core/model or runtime-control resource first, then surface a short status
summary through the rendering seam. Do not use the status line as the source of
truth, and do not persist status-only wrapper text as Pod `Message` content.
When existing behavior needs "status now, render later" semantics, preserve that
as an option on the shell status seam rather than by calling
`interactive.showStatus` directly in the feature module.

### Runtime projection and transcript boundary

Runtime projection is input shaping for a backend model, not product chat.
Secretary/Symphony may wrap a user message with model-only routing instructions,
worker constraints, xpod guardrails, auth checks, or bounded steering deltas, but
those projected instructions must not become visible chat content.

Hard rules:

- Product `Message` records store the user's actual message, visible assistant
  answer, and visible state transitions. They do not store the full projected
  prompt wrapper.
- The TUI transcript must not render headings such as `AI Secretary Symphony
  request`, internal routing policy, xpod auth guardrails, or tool-use policy
  unless the user explicitly asks to inspect debug/projection internals.
- In the Pi interactive bridge, Secretary-facing Symphony guidance is queued as
  a hidden `sendCustomMessage(..., { deliverAs: 'nextTurn' })` runtime
  projection through `linx-session-work-control.ts`, then the original user text
  is submitted unchanged. The wrapper is model context, not the submitted user
  message.
- Worker steering uses control-resource deltas and pointers to updated records.
  Do not pass raw hidden conversation deltas as if they were user chat.
- Tool diagnostics may be summarized visibly, but raw guardrail text and prompt
  scaffolding stay in runtime logs/debug surfaces.
- If projection text leaks into the transcript, Pod message content, or ordinary
  assistant reply, fix the projection/rendering seam; do not treat it as a
  prompt-style problem.

### Auth, tool, and runtime-provider boundary

Solid auth, Pod tools, and provider/model availability are adjacent but separate
surfaces:

- **Solid auth authority** is the shared local login/session root. Browser OIDC
  consent and Solid client credentials both produce a Solid session/fetch that
  LinX, xpod CLI, and local agent runtimes consume. Login modules may acquire or
  refresh that session, but feature modules should only consume the normalized
  session/auth status.
- **xpod CLI** is the direct Pod tool surface. It is appropriate for
  Secretary/Symphony diagnostics and AI-side Pod access, but it does not become
  a LinX shell command language or a hidden product state machine. Raw
  `xpod get/put`, RDF inspection, and modeled `xpod obj` access must remain
  distinct.
- **Provider/model registry state** is runtime availability state. It may tell
  the TUI which backend providers are usable now, and it may expose an upstream
  auth-storage adapter, but it is not the durable credential source of truth.
  Durable provider config, selected backend, credential source, and runtime
  capability contracts belong in shared runtime/model resources or explicit
  launch/session overrides.

Do not repair auth bugs by crossing these surfaces. If xpod can `get` a Pod
file but `rdf get` times out, the Solid session and raw file permission path are
working; fix/report the RDF/xpod layer. If the provider count is stale after
login, refresh the runtime model-registry seam; do not duplicate credential
semantics in rendering code. If an app-specific field such as `xpodWebId` or
`linxWebId` appears in runtime projection, replace it with the shared
`webId`/`podRoot`/`server` identity contract.


### Package/update command boundary

LinX has two update meanings and they must stay separate:

- `linx update` is a top-level package-management command. It updates installed
  LinX plugins/extensions through the package manager surface. It is appropriate
  at top level because it is scriptable lifecycle/package behavior.
- `/update` and startup update prompts are interactive LinX self-update flows.
  They install or upgrade the current `@undefineds.co/linx` CLI package and then
  hand off to the shell lifecycle supervisor for restart.

`/update` must be registered and consumed in the interactive shell command
surface. It must not fall through to a backend/model chat turn, and it must not
call the top-level plugin/package update path. Conversely, `linx update` must not
try to manage the active TUI raw-mode handoff or session exit copy.

Package commands must stay in a shell package module. The CLI entrypoint may
register package command descriptors, but it must not construct package manager
objects, implement install/update/remove/list behavior inline, or mix package
update with TUI self-restart handling.

### Discoverability boundary

A command is discoverable only where it is valid to execute:

- Top-level `linx --help` lists top-level LinX shell/product/package surfaces.
- TUI slash help lists interactive LinX shell commands and backend commands that
  are active in the current backend.
- Hidden compatibility, plumbing, and repair commands remain hidden. They may be
  covered by tests and maintainer docs, but they are not user navigation.

If users need a normal workflow, add or expose a real product surface. Do not use
a hidden command or flag as the documented way to operate the product.

## Pi adapter boundary

The Pi adapter is a bridge to an upstream TUI/runtime, not the product core.
Patch points in the adapter are acceptable only when they adapt upstream Pi to the
LinX shell contract:

- installing LinX command routing into Pi editor/session entry points;
- mapping Pi runtime events into shared runtime events;
- rendering LinX shell controls in Pi's TUI surface;
- supervising process/TTY lifecycle around upstream Pi behavior.

Patch points should stay thin. If a patch grows stateful or reusable, extract it
behind a named shell module before adding more behavior.

Shared runtime/backend DTO contracts are LinX-owned even when a Pi adapter
consumes them. Do not keep deprecated `Pi*` type aliases for shared completion,
stream, or backend result shapes; adapter-specific mapping belongs in the Pi
adapter, while the shared contract keeps LinX names.

The interactive bootstrap composes shell surfaces; it should not know every
feature-specific command installer. Interactive command-surface installation
belongs behind `linx-interactive-command-surface.ts`, which owns the order for
LinX shell commands, Symphony commands, backend command routing, session command
routing, command autocomplete, and runtime event bridges. Bootstrap may pass the
interactive, runtime, session cwd, and session-control manager into that module,
but must not directly import or call each command router.
Bootstrap and shell rendering helper public APIs are LinX-owned. They may adapt
upstream Pi internally, but they must not keep deprecated `Pi*` compatibility
aliases when internal callers and tests can use the LinX names directly.

Post-init lifecycle work belongs behind `linx-interactive-post-init.ts`. That
module owns the `interactive.init` wrapping point and calls narrower shell seams
after Pi has initialized. Feature modules must not install their own init
wrappers just to run after startup. They should expose idempotent actions that
the post-init seam schedules. For example, `linx-workspace-command.ts` owns cwd
resolution, `/cd`, and the visible "session cwd differs from current cwd" copy;
`linx-restored-auto-startup.ts` owns the auto-restored status copy and controller
start effect; `linx-resume-output.ts` owns normal exit copy and resume text
formatting, but its "TUI initialized" readiness mark is set by the post-init
seam; `linx-welcome-header.ts` owns welcome-card state/rendering and registers
its terminal-title contribution with the rendering title router, while startup
header replacement is a post-init effect;
`linx-update-notification.ts` owns update checks and selector rendering, but
automatic startup update checking is scheduled by the post-init seam;
`linx-login-flow.ts` owns login UI, auth-expired recovery, and pending startup
login state, but the pending-login start effect runs from the post-init seam.
`linx-interactive-post-init.ts` owns when those effects run after init.
`linx-interactive-command-routing.ts` remains the command router and must not
also become a startup-notice, restored-auto, exit-output, welcome-header,
update-check, or startup-login lifecycle installer.

Run lifecycle work belongs behind `linx-interactive-run-router.ts`. The
adapter/bootstrap path may call `interactive.run()`, but feature modules must
not replace it directly. If a feature needs a one-time action immediately before
Pi enters the foreground run loop, expose that action as an idempotent handler
and register it with the run router. Update notification is the canonical
example: LinX may suppress Pi's upstream version prompt while the LinX update
surface is active, but the update module should not own the `interactive.run`
wrapper itself.

Update version-check and notification methods belong behind
`linx-interactive-update-router.ts`. Pi exposes `checkForNewVersion` and
`showNewVersionNotification` as mutable interactive methods, but LinX features
must not replace them directly. `linx-update-notification.ts` owns LinX package
version semantics and selector rendering; it registers handlers with the update
router. The router owns the Pi method patch and the fallback decision to the
original Pi methods.

Update notification state belongs behind
`linx-interactive-update-state-host.ts`. `linx-update-notification.ts` owns the
semantic update behavior: whether a LinX package update exists, whether the user
chooses install/changelog/later, when a notification should be deferred, and when
the self-update lifecycle supervisor should restart the process. It must not
also own the hidden storage shape on Pi's interactive instance. The update-state
host owns process-local prompt and suppression flags for update-in-progress,
post-init version-check scheduling, deferred update version, and suppressing
Pi's upstream package prompt while the LinX update surface is active.

Login UI selector/dialog methods belong behind
`linx-interactive-login-ui-router.ts`. Pi exposes `showOAuthSelector` and
`showLoginDialog` as mutable interactive methods. `linx-login-flow.ts` owns the
LinX Cloud login/logout semantics, selector copy, and provider restrictions; it
registers handlers with the login UI router instead of replacing those Pi
methods directly. The router owns the Pi method patch and the fallback decision
to the original Pi login UI methods.

Login auth state belongs behind `linx-interactive-auth-state-host.ts`.
`linx-login-flow.ts` owns the semantic auth decisions: startup login prompt,
manual `/login`, expired-session recovery, retry-after-login, and error copy.
It must not also own the hidden storage shape on Pi's interactive instance. The
auth-state host owns the process-local interaction flags for login progress,
post-init login, scheduled login, pending retry descriptors, and recursive error
report suppression. Auth recovery may consume session-history retry descriptors,
but the mutable `interactive[...]` fields that coordinate the TUI prompt
lifecycle must stay behind this host.

Interactive event/error interception belongs behind
`linx-interactive-event-router.ts`. Pi exposes `handleEvent` and `showError` as
mutable interactive methods. Features may normalize event payloads, intercept a
recoverable error, or format visible error copy, but they must register ordered
handlers with the event router instead of replacing the Pi methods directly.
Feature modules that only display an error use `linx-interactive-error-display.ts`;
that helper owns the visible error fallback to status text when Pi does not
provide an error renderer.
`linx-login-flow.ts` owns LinX Cloud auth-expired recovery semantics; the event
router owns method patching, handler ordering, payload handoff, and fallback to
the original Pi methods.

Streaming assistant-message cleanup belongs behind
`linx-interactive-streaming-message-host.ts`. Auth recovery, rewind, interrupt,
or future shell features may need to remove a transient assistant streaming
message from the visible TUI, but they should call the host helper rather than
reading or writing Pi's `streamingComponent` / `streamingMessage` fields
directly. The host owns removing the component, clearing the fields, invalidating
the footer, and requesting a render.

Custom header replacement belongs behind `linx-interactive-header-host.ts`.
Welcome/startup modules own the replacement component and its state, but the
host owns how that component is installed into Pi's header container and how
`interactive.customHeader` is updated. This keeps rendering feature code from
depending on Pi's mutable header field layout.

Terminal-title rendering belongs behind `linx-terminal-title-router.ts`.
Feature modules may contribute title handlers, but they must not replace
`interactive.updateTerminalTitle` directly. This keeps Pi's own terminal title
refresh, LinX branding, and future peer/backend-specific title fragments ordered
through one rendering seam.

Session metadata reads belong behind `linx-session-metadata.ts`, while
session/runtime cwd mutation belongs behind `linx-session-cwd-router.ts`.
`/cd`, welcome header, terminal-title rendering, resume output, extension UI
context, Symphony status, and workspace startup notices may decide user-facing
copy, but reading Pi session-manager cwd/name/id, active model identity, or
applying cwd to Pi session state and LinX runtime state is a shell session-state
operation. Feature modules must call those seams instead of reading
`interactive.sessionManager.getCwd()`, `getSessionName()`, `getSessionId()`,
`interactive.session.model`, or writing `interactive.session.cwd` /
`runtime.cwd` directly. They should pass the interactive/runtime host or
explicit DTOs to the metadata seam, not extract and pass raw
`interactive.session` from feature code. Inside the metadata seam, Pi
session-manager getters must be isolated behind a single archive snapshot
helper; exported metadata resolvers consume that plain snapshot plus explicit
session/runtime fields so fallback ordering is visible without scattering Pi
getter calls.

Active session work control belongs behind `linx-session-work-control.ts`.
Feature commands that need a quiet local branch repair, such as `/rewind`, may
ask the seam to stop active work and wait briefly for idle. Interactive
interrupt paths such as Escape and auto handback may ask the seam for immediate
best-effort cancellation before continuing shell-local control flow. Projected
input paths such as peer command routing and Secretary auto input may ask the
seam whether local submission is currently safe and may ask it to deliver input
using Pi's current follow-up semantics. They must not directly inspect Pi
session running fields, select command-router original `prompt` /
`sendUserMessage` handlers, invoke auth-retry `agent.continue` / prompt
fallbacks, construct Pi follow-up options, or call Pi abort methods; the seam
owns those upstream field names/options, bypass-original delivery, auth retry
replay, and the fail-soft abort behavior.

Session history access belongs behind a dedicated shell session-history seam.
Pi's session manager is an upstream archive/context implementation detail: leaf
ids, branch entries, parent ids, branch resets, and context rebuild output are
not feature contracts. Features may define product semantics such as
"retry the pending auth-expired user turn" or "rewind before this user
message", but the seam owns how that request maps onto Pi history APIs. In
practice this means:

- auth recovery captures only a high-level pending retry descriptor
  (`continueFromId`, user prompt text, and prompt parent/branch identity) and
  delegates history traversal to the seam; the exported retry-capture entrypoint
  should remain a thin feature-facing adapter over a session-history source DTO,
  while Pi `getLeafId`, `getEntry`, `getBranch`, and `getEntries` calls stay
  inside named internal history helpers;
- retry cancellation or completion asks the seam to restore the captured branch
  before resubmitting or returning control; the exported restore entrypoint
  should accept a session-history source DTO and delegate branch/reset/context
  rebuild details to an internal helper instead of directly calling
  `sessionManager.branch`, `resetLeaf`, or `buildSessionContext`;
- session-history query exports such as
  `getLinxActiveSessionHistoryEntries`, `collectLinxRewindUserMessages`, and
  `assertLinxRewindUserEntryTarget` are still feature-facing adapters, not
  Pi-history utilities. They may resolve the shell history source and choose
  user-facing empty/error behavior, but active-branch traversal, user-message
  filtering, message text extraction, and selected-user validation must stay in
  named internal history helpers;
- rewind UI asks the seam for selectable user-message items and high-level
  rewind results. The seam owns selected-user validation, active branch
  traversal, target leaf calculation, clean session materialization, abandoned
  entry calculation, and agent context rebuilds. The exported rewind entrypoints
  should remain thin feature-facing adapters; Pi selected-user checks,
  branch/leaf traversal, clean-session materialization, abandoned-entry
  collection, and context rebuilds stay in named internal history helpers. The
  rewind command may still own TUI selector rendering, active-work cancellation,
  auto-mode reset, transcript repaint, and Pod projection delivery;
- no feature module should contain local helpers that search Pi branch entries,
  normalize Pi parent ids, call `sessionManager.branch/resetLeaf`, materialize
  clean sessions, derive abandoned history entries, or rebuild
  `session.agent.state.messages` directly.

When a new feature needs session history, add the missing operation to the
session-history seam and cover the boundary in
`apps/cli/test/shell-core-boundary.test.mjs` instead of reaching through Pi's
mutable session internals.

Raw `sessionManager` access is allowed only in modules whose declared job is to
adapt or mirror the Pi runtime archive: session-manager construction/startup
planning, `linx-session-metadata.ts`, `linx-session-history.ts`, runtime
archive diagnostics, and Pod-mirror/session-control bridge code that translates
Pi archive entries into shared model resources. Even in those bridge modules,
the output must be typed shell metadata or shared-model rows; callers should not
receive Pi manager objects as a convenience. `linx-session-manager.ts` may open,
create, list, and repair Pi archives, but any `SessionInfo` it returns must be
assembled from an explicit archive snapshot DTO rather than directly scattering
`getSessionId`, `getCwd`, `getSessionName`, or `getEntries` calls through list or
resolve branches.

Pod mirror is an archive bridge, but its projection logic still should not
scatter raw Pi getter calls through business operations. The bridge must first
materialize a narrow archive snapshot DTO (session id, optional session name,
optional session file, creation time, active entries) and then pass that DTO
through projection, mapping, token-usage, thread-title, checkpoint binding, and
metadata code. Only the snapshot/helper functions should call Pi archive getters
such as `getSessionId`, `getSessionFile`, `getSessionName`, `getEntries`,
`getLeafId`, or `getBranch`. Pod projection mapping helpers are not archive
bridge owners: they must consume explicit archive DTOs instead of accepting a Pi
`SessionManager`. The Pod mirror runtime host may own the mirror lifecycle, but
its sync checkpoint location must receive archive identity as explicit data from
runtime execution/startup archive bridge code; it must not call Pi getters just
to derive local checkpoint paths. Feature/rendering modules that only need a
session id, cwd, name, recent messages, or branch operation should request a
named seam helper instead of widening this exception.
The mirror's public API is LinX-owned (`LinxPodMirror`,
`LinxPodMirrorOptions`, `LinxPodMirrorRewindProjectionInput`) because it
projects local runtime state into LinX/Pod resources. Pi naming is allowed only
inside private archive-reference helpers, checkpoint/action ids, and sync
metadata that explicitly identify the upstream source as `pi-runtime`.

Session-level command interception is a narrower shell-session patch and belongs
behind `linx-session-command-routing.ts`. The general interactive command router
may provide the LinX shell command handler and compatibility exports, but it must
not directly patch `session.prompt`, `session.sendUserMessage`, or
`interactive.rebindCurrentSession`. This keeps editor submit routing, projected
command routing, and session method patching as separate shell seams.

Input and final-submit interception are another shell-input patch and belong
behind `linx-input-command-routing.ts`. The general interactive command router
may still own the LinX shell command handler and expose compatibility installer
functions, but it must not directly patch `interactive.getUserInput`,
or `editor.onSubmit`. Those editor/input method patches are a
lifecycle-sensitive Pi adaptation seam; keeping them in one input module
prevents slash-command routing, projected command routing, and session method
interception from depending on wrapper nesting or import order. When final
submit routing needs to re-wrap a newly rebound editor, it must register a
handler with `linx-editor-component-router.ts` instead of replacing
`interactive.setCustomEditorComponent`. Final-submit routing also must not
discover editors by reading Pi's `interactive.defaultEditor` /
`interactive.editor` fields itself; initial wrapping and rebind wrapping must
enumerate editors through the editor-component seam so Pi editor shape knowledge
has one owner.

Editor component rebinding belongs behind `linx-editor-component-router.ts`.
Pi may replace the active editor component at runtime; LinX features such as
final-submit command routing and auto editor rendering need to re-apply their
editor-level decorators after that replacement. They must register ordered
rebind handlers with the editor-component router rather than each wrapping
`interactive.setCustomEditorComponent` independently. Temporary editor
component swaps, such as credential/login dialogs replacing the editor and then
restoring it, also belong to this seam: feature modules may decide which dialog
to show, but `editorContainer.clear/addChild`, focus handoff, restore-to-editor,
and render invalidation must be done through editor-component seam helpers
instead of feature-local Pi/TUI container mutation. Dialog construction that
requires Pi's UI object also belongs to this seam: feature modules call a named
dialog factory instead of constructing `LoginDialogComponent` with
`interactive.ui` directly. The same seam owns editor enumeration for decorators:
callers ask the seam to visit LinX-interactive editor components instead of
duplicating `defaultEditor` / current-editor fallback logic in feature or
command-routing modules. Features that truly need Pi's default editor component,
such as Escape interrupt installation, must request it through this seam as
well; direct `interactive.defaultEditor` reads outside the editor-component
router are a shell/core boundary violation.

Extension UI context augmentation belongs behind
`linx-extension-ui-context-router.ts`. Pi creates an extension UI context for
dialogs such as approval selectors, confirms, and inputs; LinX features may
decorate that context with Pod-backed approval or Secretary mediation. Those
features must register ordered context handlers with the router instead of each
wrapping `interactive.createExtensionUIContext`.

Runtime session thinking capability belongs behind
`linx-session-thinking-capability-router.ts`. Provider-specific capability
rules, such as LinX Cloud exposing `xhigh` only for reasoning-capable models,
must register handlers with that router. They must not replace
`session.supportsXhighThinking` or `session.getAvailableThinkingLevels`
directly, because multiple providers or runtime layers may need to contribute
thinking-level capability rules.

Interactive Pod authority lookup belongs behind
`linx-interactive-runtime-host.ts`. Symphony, extension UI, auto mode, and other
feature modules may require the active WebID/Pod session to route product
resources, but they must not scan `interactive.podSession`,
`interactive.session.podSession`, or `interactive.session.state.webId`
themselves. The runtime host owns those compatibility fields and the lazy
`runtime.getPodDataSession()` lookup/cache path.

Interactive model registry access belongs behind
`linx-interactive-model-registry-host.ts`. Login, logout, Solid client
credentials, and `/ai connect` may decide semantic credential behavior, but they
must not reach through `interactive.session.modelRegistry` or its `authStorage`
field directly. The host owns Pi's session/model-registry field shape and
exposes narrow operations such as auth-storage lookup and model-registry refresh.
Provider-count rendering remains separate in
`linx-interactive-provider-count-host.ts`; refreshing the model registry does not
authorize feature code to mutate provider-count display internals.

Concrete LinX shell command execution belongs behind
`linx-shell-command-executor.ts`. The interactive command routing module may
parse slash input, install submit/projected/input/session routers, clear the
editor, and delegate a parsed `LinxShellCommand`; it must not directly import or
call feature executors such as update, rewind, statusline, `/ai connect`,
workspace `cd`, peer-command delivery, or auto command execution. The executor
is the composition point for concrete command actions; narrower feature seams
still own their domain side effects.

Peer-command projection is a shell-session delivery seam and belongs behind
`linx-peer-command-routing.ts`. The general interactive command router may parse
`/goal` or other peer commands and dispatch the parsed route, but it must not
directly inspect `session.prompt`, `session.sendUserMessage`, session-command
original-method accessors, or goal mirror side effects. This keeps "what command
was parsed" separate from "how a projected peer command is delivered to the
active backend session".

Auto command execution is a shell input-ownership seam and belongs behind
`linx-auto-command-routing.ts`. The general interactive command router may parse
`/auto` and dispatch the parsed route, but it must not directly mutate auto mode
state, start or stop the Secretary auto input controller, fire auto control
callbacks, or own the user-visible auto status copy. Interrupt, restored-startup,
and other shell lifecycle modules that need to disable or inspect auto mode
should call the auto command seam directly instead of importing the general
command router.

Submitted user-message recording is a shell session-control seam and belongs
behind `linx-submitted-user-message-recording.ts`. The general interactive
command router may decide that an input is not a LinX shell command and then
delegate recording, but it must not directly construct session-control records,
handle reconciliation warnings, or import the session-control manager for this
purpose. This keeps command ownership separate from chat/thread reconciliation
side effects.

Session-control manager and runtime-event bridge state belong behind
`session-control.ts`. They must not be stored as ad hoc
`interactive.__sessionControl*` or `runtime.__sessionControl*` fields. The
session-control seam may use a named process-local registry so multiple compiled
entry bundles in the same process can resolve the same manager, but callers must
access it through `getSessionControlManager()` and
`installSessionControlRuntimeEventBridge()`. This keeps control-session state
observable through an explicit shell module rather than turning the Pi
interactive object into a service locator. Because session-control bridges a
business session and a local control archive, Pi archive getters such as
`getSessionId`, `getSessionFile`, `getSessionDir`, and `getCwd` must be isolated
inside named archive-ref helpers before product-facing `businessSession` or
`controlSession` refs are assembled. Callers consume those refs as data; they do
not derive product identity from Pi manager objects.

The current remaining design debt is shared shell state. Some modules still use
`__linx*` properties on the interactive, editor, runtime, or session object.
Only local patch sentinels and original-method handles are acceptable there.
Runtime config, command bridges, mode flags, background work handles, and
cross-feature state must go through named shell modules so ownership, lifetime,
and tests are explicit.

Current shell-state rules:

- Mode state belongs in `linx-interactive-shell-state.ts`: auto enabled flag,
  auto input controller handle, auto control-change callbacks, Symphony
  enabled/generation, goal enabled flag, goal supervisor interval, and goal
  supervisor timestamps.
- Projected command bridges belong in `linx-interactive-shell-state.ts`:
  Secretary/auto projected global commands, backend-native commands, and
  `/ai connect` command injection.
- Symphony interactive runtime config belongs in
  `linx-interactive-shell-state.ts`: Pod projection runtime, worker backend,
  worker credential source, worker model, worker supervisor interval, status
  timeout, testable `run/list` hooks, dispatch promises, and dispatch abort
  controllers.
- Pod mirror runtime handles belong in `linx-pod-mirror-runtime-host.ts`.
  Rewind and other shell modules may ask the host module for the active mirror,
  but must not read or write mirror handles through `runtime.__linx*` or
  `interactive.__linx*` fields, and must not know fallback lookup details such as
  `interactive.runtime`. The Pod mirror host itself must also resolve the active
  runtime through `linx-interactive-runtime-host.ts` rather than duplicating the
  interactive runtime fallback.
- Runtime host callback hooks belong in `linx-interactive-runtime-host.ts`.
  Shell modules may register and read those hooks through explicit host helpers,
  but must not use runtime hidden fields such as before-invalidate or rebind
  callback slots. The active runtime object itself is also a runtime-host lookup:
  feature modules that only need the current runtime must request it through the
  host helper instead of reading `interactive.runtime`. Installing that active
  runtime on the Pi interactive instance also goes through the same runtime host;
  bootstrap composition should not write `interactive.runtime` directly.
  Runtime-owned feature hooks, such as the `/ai connect` credential saver, follow
  the same rule.
  Symphony dispatch code also resolves worker/runtime fallbacks through this
  seam before reading runtime-owned backend, model, credential, or session data.
  Lifecycle callbacks that receive only a target interactive object, such as the
  post-init interrupt auto handback hook, must use the same runtime host lookup.
- Interactive init/lifecycle state reads belong in
  `linx-interactive-lifecycle-host.ts`. Feature modules that need to decide
  whether TUI-only UI can be shown must use a named lifecycle helper instead of
  reading `interactive.isInitialized`.
- Interactive stop/exit requests from feature modules must go through the shell
  lifecycle seam, such as `stopInteractiveShellUnlessRestarting`, instead of
  calling `interactive.stop()` directly. Feature code does not own restart-aware
  terminal shutdown. Public shell bootstrap stop APIs follow the same seam so
  externally requested cleanup does not race TUI self-update restarts.
- Runtime Pod session cache belongs in `linx-interactive-runtime-host.ts`.
  Shell modules that discover or reuse `runtime.podSession` must use explicit
  host helpers; feature modules such as Symphony may read/write the cached Pod
  session for source-context discovery only through that seam, not by mutating
  `interactive.runtime.podSession` directly.
- Direct `interactive.__linx*` fields may be added only when they are local
  install sentinels or upstream original-method references that cannot be held
  anywhere else. New exceptions need a boundary test in
  `apps/cli/test/shell-core-boundary.test.mjs`.

## Self-update contract

There are two different update surfaces:

1. **Top-level package update command** (`linx update`): updates installed LinX
   plugins/extensions through Pi's package manager. It is a non-interactive CLI
   package-management command.
2. **In-TUI LinX self-update** (`/update` or startup update selector): installs
   the latest `@undefineds.co/linx` package and restarts the interactive LinX
   process.

The in-TUI self-update path is a shell lifecycle feature. It must use the shell
lifecycle supervisor for restart. It must not live as ad hoc process-spawn logic
inside branding or dialog code.

The lifecycle supervisor must own the full handoff:

- mark the current interactive shell as restarting before touching terminal
  state;
- suppress normal session-closed/resume copy for the whole abandoned shell
  instance, not only for the first `stop()` call;
- keep manual `/update` command handling awaited through selector handling,
  install, and restart; it must not fire-and-forget the selector or restart work
  while the old TUI command handler returns;
- drain terminal input when the upstream TUI exposes a drain hook, then stop the
  old TUI, then spawn the replacement process with inherited stdio;
- keep the parent process alive until the replacement process closes, and mirror
  its exit code.

Feature code such as `/update` may ask the lifecycle supervisor to restart, but
must not call `process.spawn`, restore raw mode, or decide whether exit copy is
visible on its own. The replacement process must launch the LinX executable
surface, not expose an upstream `pi` banner or resume command; seeing upstream Pi
startup copy after a LinX self-update is a shell lifecycle handoff bug.

## Documentation placement

- This document owns shell/core modeling only.
- Feature behavior belongs in feature docs such as `docs/cli-status-line.md`,
  `docs/cli-login-and-key-principles.md`, and release/update docs.
- Shared Pod/resource modeling belongs in `docs/cli-app-shared-core.md`,
  `docs/backend-pod-contract.md`, `docs/pod-interaction-layering.md`, and
  `@undefineds.co/models` contracts.
