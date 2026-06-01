# Auto And Symphony Contract

This document fixes the product semantics for LinX TUI `auto` and `symphony`.
Keep code, tests, CLI help, and release notes aligned with this contract.

## Auto Is One Switch

`auto` is a single on/off switch.

- `auto off`: the user drives the current Secretary/backend conversation directly.
- `auto on`: AI Secretary drives the current conversation and asks the user only when blocked.
- There is no product-level `manual`, `smart`, or multi-tier auto mode in the LinX TUI.
- The command surface is one command: `/auto on|off|status`.
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

## Symphony Is Secretary Delegation

`symphony` is an AI Secretary delegation capability, not a separate product or a
third auto level.

`/symphony` changes how Secretary analyzes an objective:

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

`auto` and `symphony` are orthogonal:

- `auto on + symphony off`: Secretary may drive one current conversation.
- `auto off + symphony on`: Secretary may propose delegation but should not
  silently drive beyond explicit user input.
- `auto on + symphony on`: Secretary may delegate and manage workers within
  policy, while asking when blocked.

## Implementation Guardrails

- Slash autocomplete must include `/auto` wherever `/symphony` is available.
- `/auto` must be handled by the LinX shell before backend command fallback.
- `/auto on` must update LinX session state, not backend approval policy.
- `/auto on` must not inject control text into the active chat transcript.
- The control session model is backend-agnostic: Codex, Claude, CodeBuddy, cloud
  runtimes, and future agents are all runtime participants behind the same
  multi-agent control plane.
- CLI interactive startup must pass an initial objective into the TUI when the
  user runs `linx --auto <objective>`.
- Tests should reject old `/manual` and `/smart` command surfaces unless a new
  product decision explicitly changes this contract.
- `/symphony status` must read Pod-projected worker state before local fallback.
  Local archive is only no-Pod/offline recovery, not product truth.
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
