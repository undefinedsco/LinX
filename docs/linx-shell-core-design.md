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

TUI command routing is shell-owned, but it has two classes of commands:

- **LinX shell commands:** commands whose behavior controls the LinX shell, for
  example `/update`, `/statusline`, `/rewind`, `/ai connect`, `/cd`, and local
  shell switches.
- **Backend-native commands:** commands that belong to the active worker/backend
  and should be forwarded as native backend input whenever possible.

The router may parse enough to decide ownership. Once a command is backend-owned,
LinX should preserve the backend command language rather than redefining it.

A shell command may call shared core use-cases. It must not implement its own
copy of shared business semantics. If a command needs provider config, auth
status, approval state, chat/thread/message state, or Pod resource identities, it
must use the shared model/runtime contract.

The submit router owns the first decision point for interactive user input. The
current priority order is:

```text
10 login
20 Symphony
40 backend-native slash commands
50 LinX shell command fallback
```

Handlers return `true` only when they consumed the input. Unknown commands and
ordinary messages must fall through to the next handler or Pi's original submit
path. A handler must not call the original submit and then also report
`false`; that creates duplicate turns.

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
second LinX product command.

Pi-aligned command boundaries:

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

Specific decisions currently in force:

- Do not add `linx sessions` or `linx --sessions`. Session listing/selection is
  Pi startup/TUI selector behavior: `linx -r`, `linx --resume`, and `/resume`.
- Do not add top-level `linx new`, `linx fork`, `linx session`, `linx model`,
  or `linx help` aliases. Those are backend/TUI command words.
- Keep `linx models` only as Cloud model-list inspection. It is plural because
  it is not the same concept as backend-native `/model <id>` switching.
- `--session`, `--session-dir`, and `--session-id` are runtime archive selectors.
  They are not Pod chat/thread IDs and must not leak into shared data models.
- When a backend exposes richer native command help, expose it where the backend
  is active, not through top-level `linx --help`.

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
