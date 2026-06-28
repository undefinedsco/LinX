# Auto And Symphony Contract

This document fixes the product semantics for LinX TUI `auto` and `symphony`.
Keep code, tests, CLI help, and release notes aligned with this contract.

## Auto Is One Switch

`auto` is a single on/off switch.

- `auto off`: the user drives the current Secretary/backend conversation directly.
- `auto on`: AI Secretary drives the current conversation and asks the user only when blocked.
- There is no product-level `manual`, `smart`, or multi-tier auto mode in the LinX TUI.
- The command surface is one command: `/auto on|off|status`, with `/auto <input>`
  as shorthand for turning auto on and giving Secretary the first control input.
- `--auto` starts the same switch in the `on` state.

`auto` controls who drives the session input loop. It is not the backend's native
tool approval setting.

`/auto on` is a control-plane event. It must not create a user-authored message,
custom message, prompt, follow-up, steer, or backend turn inside the active
business chat. Enabling auto creates or reuses a separate AI Secretary control
session that records the relationship to the business session and later blocked
runtime requests.

Product messages and model inputs are different objects. A `Message` in a
`Chat / Thread` means something actually happened in the user-visible product
timeline: who said what, and where it happened. The prompt/context sent to a
backend model is a runtime input projection derived from product facts,
policies, and archives; it is not automatically a product message. If Secretary
produces the next backend `user` input, the Thread fact still records Secretary
as the maker/source of that intent. The adapter then projects that intent into
the backend-required role. The temporary Secretary control session should store
control entries, pointers, runtime projection hints, and execution-side
projections, not fabricate chat messages.

When `auto on`, Secretary owns the next backend-facing user input slot. That
projected input must pass through a command ownership layer before it reaches
the current chat peer.

- Command ownership is resolved by the shared auto-mode core. Shells may expose
  different UI affordances, but they must consume the same route result instead
  of re-parsing `/auto` or `/goal` semantics locally.
- `/auto` is Secretary control-plane input. It must not be sent to the current
  chat peer as a peer command.
- `/rewind [turns]` is LinX session control-plane input. It moves the active Pi
  session branch before recent user turns without deleting append-only JSONL
  history. It must not be sent to the current chat peer as a peer command.
- `/goal <peer-command>` is a peer command. Secretary may send it into the
  current peer input lane; LinX records that Secretary issued the command and
  mirrors Secretary supervision behavior after sending it when shared core can
  infer a behavior change.
- Other slash commands must be routed by ownership: Secretary-owned commands are
  handled locally, peer-owned commands are delivered to the current chat peer,
  and non-command text is projected as runtime `user` input.

`/auto <input>` must therefore not create a user-authored business message. It
turns auto on and passes `<input>` into the Secretary-owned input lane.

In the interactive TUI, auto ownership is visible through the footer/status line,
not by replacing or decorating Pi's main composer/editor frame. LinX may configure
Pi's native editor settings, but Pi remains the owner of the message editor.

## Approval Policy Is Separate

Backend-native approval policy stays in the backend configuration channel.

For example, Codex `approvalPolicy` decides how Codex asks for file, command, or
permission approval. LinX `auto on` decides whether Secretary may handle the
session on the user's behalf and ask only when blocked.

Do not implement `auto on` by forcing backend approvals to `never`. Do not
implement backend approval modes as `/manual`, `/smart`, or extra LinX auto
levels.

## What Secretary May Do In Auto

When `auto on`, Secretary may:

- continue the current objective without waiting for another user message;
- route backend approval and structured input requests through the Secretary
  policy/grant path;
- answer requests when the answer is derivable from current context, Pod-backed
  credentials/config, or explicit user instructions;
- ask the user when the request is out of policy, destructive, credential-gated,
  ambiguous, or not safely inferable;
- record delegated actions as Secretary actions on behalf of the user rather
  than fabricating user-authored Pod messages.

Secretary does not receive every backend tool call as an active turn. Normal
tool calls stay in the target runtime/session archive. Secretary is invoked by
blocked control-plane events such as `approval.required` and `input.required`.
Those events carry pointers to the business session, runtime session, archive,
tool history, and request object, so Secretary can inspect prior tool execution
only when it needs evidence to decide whether it can act for the user.

When `auto off`, backend prompts, approvals, and free-form input are surfaced to
the user unless another explicit user-approved control path handles them.

Auto-mode approval/input quality inspection belongs to the unified
approval/grant pipeline. `auto` should report whether Secretary one-time
decisions, reaction windows, user overrides, waits, and runtime apply results
were correct through shared approval/audit/grant records; it must not create a
parallel auto-only approval metric or policy model.

## Goal Is A Peer Command

`goal` is not another auto level and not a shell-owned lifecycle protocol. It is
a peer command:

- `/goal <peer-command>` is routed unmodified to the current chat peer.
- The current chat peer owns the `/goal` command grammar, output, validation,
  and completion semantics.
- LinX core may observe the routed command and update Secretary supervision as
  a local behavior mirror. This mirror is not the peer command response and must
  not replace the peer response.
- Common mirror rules: `/goal status` does not change local Secretary behavior;
  `/goal pause`, `/goal close`, and `/goal cancel` pause local Secretary goal
  supervision; other non-empty `/goal ...` commands activate local Secretary
  goal supervision.

This separates two axes:

- `auto` decides who writes the next input slot: user or Secretary.
- `goal` decides whether the current chat peer behaves like one-turn chat or a
  persistent actor pursuing an objective.

`/symphony` chooses the current chat peer:

- `symphony off`: the user is chatting directly with the worker/backend peer.
- `symphony on`: the user is chatting with Secretary; Secretary may then create,
  update, or steer worker chats as part of orchestration.

In the common auto + direct-worker path, the user enables auto while Symphony is
off, Secretary writes `/goal <objective>` into the worker input lane on the
user's behalf, and then Secretary supervises through bounded
steering/checkpoint inputs instead of responding to every worker turn. The
default supervisor cadence is minutes-level, not per-message; a supervisor
check may intentionally produce no projected input when the current chat peer
is still on track.

## Symphony Selects Chat Peer

`symphony` is the switch for who the user is chatting with. It is not a separate
product or a third auto level.

- `symphony off`: normal chat goes to the current worker/backend peer.
- `symphony on`: normal chat goes to Secretary, which uses Symphony skills to
  judge whether the message is ordinary chat, an Idea, a change to existing
  work, or delegable work.

When `symphony on`, the visible input lane must remain Secretary-owned even
while one or more workers are running. User input is appended to and rendered in
the Secretary-facing Thread first, then Secretary may answer directly, update
control state, or project a bounded steer/input to a worker Thread. Dispatching
or entering a worker runtime must not steal the user's visible echo, make
Secretary messages invisible, or silently route normal text to a worker. If
Secretary forwards a message to a worker, the UI should show a visible
acknowledgement or status transition in the Secretary Thread.

Worker activity is not a reason to stop answering Secretary-facing chat. When a
worker reports progress, requests approval/input, fails, or completes, the event
is delivered to the control plane/inbox and projected to any active Secretary
client. The active Secretary may inspect the referenced resource and decide
whether to summarize it, ask the user, steer the worker, or wait. The projected
event should carry stable resource ids/pointers, not a full hidden transcript
or prompt wrapper. The event itself is control-plane context for Secretary; the
visible product message is whatever Secretary chooses to say in response.

If multiple clients are open, active-client selection is a subscription/runtime
concern, not a new Symphony state machine. Clients subscribe to the same Pod
control resources and local runtime events, then wake their active Secretary
lane when an InputRequest, ApprovalRequest, InboxNotification, Delivery, or Run
status change is relevant to the current Chat/Thread. Polling may be a fallback
transport, but it must not become a second source of truth.

When `symphony on`, Secretary analyzes objectives this way:

- treat ordinary chat as `Message`, not as an `Issue`;
- identify the issue/work item;
- compare against existing open Issues before creating a new one;
- update the existing Issue when the objective is clearly the same work item;
- ask the user when new-vs-existing is ambiguous;
- split it into concrete worker-owned tasks;
- choose target Chat resources for worker delivery;
- create or update Issue / Delivery / Session records;
- dispatch work to backend workers;
- track worker status and escalate blockers back to Secretary or the user.

That analysis is internal by default. User-facing replies in Symphony mode
should look like normal chat unless a visible state change happened or the user
asks for status/details. Do not print Symphony judgment, Issue/Task routing,
worker selection, or report-style sections for ordinary chat or early idea
exploration. When Secretary creates/updates work, hands off a task, hits a
blocker, or needs a decision, summarize the visible outcome and next step
briefly; `/symphony status` is the detailed inspection surface.

### Internal Projection Is Not Product Chat

Symphony may wrap a user message with runtime-only control instructions before
sending it to a backend model. Examples include Secretary-facing routing text,
worker-selection constraints, xpod tool-use guidance, and authorization checks.
Those wrappers are runtime input projections, not product messages.

Hard rules:

- The visible Secretary Thread stores the user's actual message, Secretary's
  visible answer, and visible state transitions. It must not store or render the
  internal wrapper text.
- The assistant response must not echo headings such as
  `AI Secretary Symphony request`, internal routing instructions, xpod auth
  guardrails, or model-facing policy text unless the user explicitly asks to
  inspect debug/projection internals.
- Backend model input may include internal instructions, but Pod `Message`
  records should point to the product-visible content and control resources,
  not to the full projected prompt.
- If internal projection text appears in the TUI transcript, Pod message
  content, or normal assistant answer, treat it as a projection/rendering
  boundary bug rather than as a Secretary style issue.
- Tool probes and xpod diagnostics should be summarized as visible outcomes, not
  pasted as the product answer by default. Show raw command transcripts only
  when the user asks for debugging detail or when the raw output is the evidence
  needed to make a blocker actionable.

When Symphony needs to inspect or mutate Pod control resources from the AI side,
the direct tool surface is `xpod` running under the same Solid authority as the
LinX session. Modeled resources such as Idea, Issue, Task, Delivery, Run,
RunStep, Report, Evidence, ApprovalRequest, InputRequest, and InboxNotification
should go through modeled `xpod obj`/shared-model surfaces. Raw `xpod get`,
`put`, or RDF file operations are for explicit file-primary resources or
diagnostics, not for hand-patching modeled product records.

Before mutating Pod state, Secretary should verify `xpod auth status` / `whoami`
matches the active LinX session's `webId` and `podRoot`. This is an identity
guard, not a second login flow: xpod CLI and LinX must share
`${SOLID_HOME:-~/.solid}/auth`, and Secretary must not ask the user for Solid
tokens or client secrets while it is already running inside an authenticated
LinX runtime. A mismatch is a blocker to surface, not a reason to invent
app-specific credentials.

For diagnostics, choose the command by resource shape:

- `xpod obj ...` for modeled product/control resources;
- `xpod get` / `xpod put` for file-primary resources and raw byte verification;
- `xpod rdf ...` only when an RDF parsed/triple view is specifically required.

A small file that writes successfully but times out under `xpod rdf get` is an
xpod/RDF parsing or transport problem, not evidence that Symphony lacks Pod
permission. Report the exact path, command, status, and timeout rather than
rewriting the resource by hand.

`auto` and `symphony` are orthogonal:

- `auto on + symphony off`: Secretary owns the input lane, but the current chat
  peer remains the worker/backend peer.
- `auto off + symphony on`: the user chats with Secretary directly; Secretary
  may propose delegation but should not silently drive beyond explicit user
  input.
- `auto on + symphony on`: Secretary owns the input lane for its own control
  conversation and may delegate/manage workers within policy, while asking when
  blocked.

## Implementation Guardrails

- Slash autocomplete must include `/auto` wherever `/symphony` is available.
- `/auto` must be handled by the LinX shell before backend command fallback.
- `/auto on` must update LinX session state, not backend approval policy.
- `/auto on` must not inject control text into the active chat transcript.
- `/goal` must be classified by shared auto-mode core as a peer command before
  backend command fallback, then delivered to the current chat peer unmodified.
- `/rewind` must be handled by the LinX shell before backend command fallback.
  Pod/runtime session projection must use the active branch, not all append-only
  JSONL entries, so abandoned turns remain auditable but do not pollute current
  context.
- Secretary-generated inputs must pass through LinX command handling before
  backend projection; otherwise Secretary cannot safely use `/goal`, `/model`,
  `/auto`, or future control commands.
- The control session model is backend-agnostic: Codex, Claude, CodeBuddy, cloud
  runtimes, and future agents are all runtime participants behind the same
  multi-agent control plane.
- CLI interactive startup must pass an initial objective into the TUI when the
  user runs `linx --auto <objective>`.
- Tests should reject old `/manual` and `/smart` command surfaces unless a new
  product decision explicitly changes this contract.
- `/symphony status` must read Pod-authoritative worker/control state. Local
  archive is only portable no-Pod/offline recovery, not product truth or a
  fallback when the LinX Pod control read fails.
- Worker dispatch prompts and projected Task/Delivery/Run metadata must carry
  the worker Pod access boundary. The MVP default is report-only: workers get a
  task brief/control-record snapshot and return structured progress, blockers,
  evidence, Delivery reports, or Implementation Change Requests for Secretary
  to persist. Direct worker Pod read or restricted write is an explicit granted
  capability; even then workers must not close Issues, rewrite acceptance/current
  truth, change work split, alter release/roadmap state, or create grants.
- Pod Issue/Spec/Task records are the control authority. Repository docs are the
  implementation authority. Repo work briefs may reference Pod URIs but must not
  become a second Issue truth.
- Symphony must keep three spaces distinct without forcing the same topology on
  all of them: shared Pod/control records, explicit runtime/session topology,
  and Thread workspace allocation. Same-Thread workers in the same environment
  should normally share a workspace; worker transcript topology may be same-room
  or runtime-projected through control events depending on the Thread.
