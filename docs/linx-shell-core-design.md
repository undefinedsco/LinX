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
  `defaultEditor.onSubmit` independently.
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

A shell command may call shared core use-cases. It must not implement its own
copy of shared business semantics. If a command needs provider config, auth
status, approval state, chat/thread/message state, or Pod resource identities, it
must use the shared model/runtime contract.

The submit router owns the first decision point for interactive user input. The
current priority order is:

```text
10 login
20 Symphony
40 LinX-proxied backend slash commands
50 LinX shell command fallback
original Pi submit path for unconsumed Pi/backend-native commands and messages
```

Handlers return `true` only when they consumed the input. Unknown commands,
Pi-native slash commands, and ordinary messages must fall through to the next
handler or Pi's original submit path. A handler must not call the original submit
and then also report `false`; that creates duplicate turns.

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
  product data-model fields.
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
- When a backend exposes richer native command help, expose it where the backend
  is active, not through top-level `linx --help`.



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

### Package/update command boundary

LinX has two update meanings and they must stay separate:

- `linx update` is a top-level package-management command. It updates installed
  LinX plugins/extensions through the package manager surface. It is appropriate
  at top level because it is scriptable lifecycle/package behavior.
- `/update` and startup update prompts are interactive LinX self-update flows.
  They install or upgrade the current `@undefineds.co/linx` CLI package and then
  hand off to the shell lifecycle supervisor for restart.

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

The interactive bootstrap composes shell surfaces; it should not know every
feature-specific command installer. Interactive command-surface installation
belongs behind `linx-interactive-command-surface.ts`, which owns the order for
LinX shell commands, Symphony commands, backend command routing, session command
routing, command autocomplete, and runtime event bridges. Bootstrap may pass the
interactive, runtime, session cwd, and session-control manager into that module,
but must not directly import or call each command router.

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
`editor.onSubmit`, or `interactive.setCustomEditorComponent`. Those editor/input
method patches are a lifecycle-sensitive Pi adaptation seam; keeping them in one
input module prevents slash-command routing, projected command routing, and
session method interception from depending on wrapper nesting or import order.

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
interactive object into a service locator.

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
  `interactive.__linx*` fields.
- Runtime host callback hooks belong in `linx-interactive-runtime-host.ts`.
  Shell modules may register and read those hooks through explicit host helpers,
  but must not use runtime hidden fields such as before-invalidate or rebind
  callback slots.
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
- drain terminal input when the upstream TUI exposes a drain hook, then stop the
  old TUI, then spawn the replacement process with inherited stdio;
- keep the parent process alive until the replacement process closes, and mirror
  its exit code.

Feature code such as `/update` may ask the lifecycle supervisor to restart, but
must not call `process.spawn`, restore raw mode, or decide whether exit copy is
visible on its own.

## Documentation placement

- This document owns shell/core modeling only.
- Feature behavior belongs in feature docs such as `docs/cli-status-line.md`,
  `docs/cli-login-and-key-principles.md`, and release/update docs.
- Shared Pod/resource modeling belongs in `docs/cli-app-shared-core.md`,
  `docs/backend-pod-contract.md`, `docs/pod-interaction-layering.md`, and
  `@undefineds.co/models` contracts.
