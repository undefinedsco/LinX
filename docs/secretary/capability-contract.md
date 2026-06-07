# AI Secretary Capability Contract

AI Secretary is a user-side agent capability, not a hidden policy engine. It can
help interpret context, recommend a response, and act within user-granted
authority, but it must keep decisions visible and keep durable state in the
shared Pod model.

## Core Capabilities

- Explain and continue the default LinX chat experience with the user.
- Observe backend runtime events when LinX runs an external backend such as
  Codex, Claude Code, or CodeBuddy.
- Evaluate approval requests emitted by the selected backend.
- Answer structured user-input requests when the answer is already derivable
  from session context, Pod-backed credentials/config, or explicit request
  options.
- Evaluate whether an existing user-authored grant covers a concrete request.
- Plan durable Pod writes for user-requested configuration, credentials, grants,
  preferences, or similar state.
- Produce user-visible rationale for automation decisions and pending actions.
- When planning a Symphony dispatch, treat the target Chat as first-class: the chat identifies the counterpart or group, the thread identifies the concrete work timeline, and the session only records runtime lifecycle. Do not conflate the target chat with the Secretary control room.

## Non-Capabilities

- It must not invent a parallel approval policy from CLI-local tool allowlists.
- It must not recommend or select `allow_for_session` / `allow_always`. Grant
  creation is a user decision expressed through the unified approval UI.
- It must not silently write or mutate Pod state when the target resource type,
  existing match, or required authority is ambiguous.
- It must not author shared Pod paths, RDF predicates, subject templates, or
  Turtle directly. Those belong to `@undefineds.co/models` and `drizzle-solid`.
- It must not fabricate secrets, tokens, file paths, model config, or user
  preferences.

## Product Skill Boundary

Secretary runtime skills are product capabilities: how to triage user intent,
split work, dispatch workers, track status, accept completed work, and escalate
blockers. Product orchestration skills such as `symphony` may be used
both by Secretary at runtime and by coding agents implementing or verifying the
same LinX behavior.

Secretary's configured skills are resource-backed product inputs, not opaque
prompt fragments. The Secretary Agent is a container resource; its default
runtime config is metadata on that container, and skill bindings point to skill
files or skill folders. A Solid-backed store may describe the container through
`.meta`, but product code should reach it through shared models/repositories,
not by hardcoding Pod paths.

The default persisted Secretary Agent key is the system-reserved
`__secretary__`. Use it for durable Agent, Skill, maker, actor,
grant-recipient, and runtime-snapshot identity. The canonical Agent resource is
the container `/agents/__secretary__/`; `.meta` is only the storage document that
may describe that container. The default Secretary Chat may use the same
reserved key under the Chat resource base, for example
`/.data/chat/__secretary__/index.ttl#this`; it remains a Chat resource, not the
Agent identity.

Treat `/agents/__secretary__/` as a user-owned context folder, not as a single
merged config object. System-managed surfaces and user-managed surfaces live
under the same folder with different authority. System-managed surfaces include
the installed Secretary package record, built-in skill bindings, migration
records, and capability envelope. User-managed surfaces include `AGENTS.md`,
preferences, user-installed skills, grants, memory policy, and any forked skill
bindings. Runtime assembly is a projection, similar to loading a system message
and then `AGENTS.md`; it must not write the projected result back as the new
truth.

Upgrades only mutate system-managed surfaces unless a migration explicitly asks
for user acceptance. User personalization survives package upgrades unchanged.
When a user changes a system skill, represent it as a user-managed fork or
override binding with its own source/version/checksum instead of editing the
system-managed skill in place.

Skill content should remain file-backed, for example a `SKILL.md` plus related
files. Skill metadata should record binding facts such as enabled state,
version, source, checksum, load policy, dependencies, and relations. It should
not duplicate full skill text in RDF or local runtime JSON. A Secretary skill
resource is an Agent-scoped binding/installation record; external or reusable
skills should keep their source identity in `source/version/checksum/root`
rather than sharing one mutable Agent-local resource.

Agent root and Agent WebID are separate. Secretary needs an Agent WebID only
when it must appear as an auditable actor, requester, maker, grant recipient,
credential holder, or authorization subject. Ordinary skill resources,
deliveries, issues, tasks, runs, reports, evidence, and files use resource URIs,
not WebIDs.

Developer implementation skills are different. Keep `drizzle-solid`,
`solid-modeling`, and `xpod-componentsjs` available to engineers or coding
agents when they are changing schemas, repositories, or Xpod UI/component
integrations, but do not inject them into the user-facing Secretary prompt.
Pod operation guidance belongs to the external `xpod-cli` marketplace skill,
not a LinX-local `pod_read` / `pod_write` skill. If Secretary needs durable
data, it should request a product-level plan or call a bounded product
operation; shared model/runtime code owns exact predicates, URI templates,
storage paths, and component APIs.

## Approval And Input Handling

The trigger comes from the backend runtime, not from LinX guessing which tools
are dangerous. When the backend emits an approval or structured input request,
LinX can mirror the request to Pod and ask AI Secretary for a recommendation.

AI Secretary may recommend:

- allow/accept,
- deny/reject,
- cancel,
- provide a structured input answer,
- wait for the user,
- inject a clarifying message,
- pause or stop the backend when the runtime supports that control.

If the recommendation has enough confidence and is allowed by current mode,
LinX may show a visible reaction window before applying it. The reaction window
must not be shorter than the product minimum and should be longer for lower
confidence. If AI Secretary cannot decide safely, LinX waits for the user with
the recommended option still visible.

Secretary recommendations are one-time decisions only. `allow_for_session` and
`allow_always` are user grant decisions; they are materialized by the shared
approval pipeline, not by Secretary.

## Grant Coverage

Grants are user-authored LLM Wiki resources in Pod. They are durable policy
pages, not request fingerprints.

AI Secretary can use grants in two phases:

- Candidate retrieval: indexed fields such as action, target, tags, risk, source,
  or status may narrow the candidate set.
- Semantic coverage: the secretary must read the page title, summary, body,
  provenance, context, and relevant request details before deciding whether a
  grant actually covers the current request.

Coarse metadata matches are insufficient by themselves. If semantic coverage is
unclear, the request falls back to the normal visible approval path.

Grant coverage is checked by the unified approval pipeline before asking
Secretary to make a new one-time decision. Existing grant coverage can approve a
request even when `auto` is off.

## Storage Planning

When the user asks the secretary to save something, the secretary must request a
storage plan instead of guessing a location.

The planning layer should:

- classify the intent into a supported resource type,
- inspect existing matching Pod resources,
- decide create, update, link, ask, or unsupported,
- explain the target resource and mutation,
- require user confirmation for ambiguity, conflicts, low confidence, missing
  required fields, or missing authority.

The secretary may reason over the returned plan and user-facing summary. Shared
model/runtime code owns exact resource resolution and writes.

See [Storage modeling TODO](./storage-modeling-todo.md).

## Turn Controller Boundary

The agent turn controller decides when a participant should observe context and
produce an output. It is a lightweight routing capability, not the secretary's
identity or policy source.

For auto-mode approval/input flows, the controller can route the current request
to AI Secretary with bounded recent context, matching grants, and current
approval/input details. The secretary model is still user-configured; the fast
companion/controller model must not hardcode secretary behavior.

For group chat, the controller may decide which AI participant should see the
current context and whether a response is appropriate. That routing decision is
separate from Pod persistence and separate from approval authority.

## Shared Data Boundary

Secretary-specific product capability rules live in this directory.

Shared data semantics remain in the owning packages:

- `@undefineds.co/models`: RDF classes, predicates, vocab, schema, repository
  use-cases, and cross-app business semantics.
- `drizzle-solid`: generic resource identity, locator, IRI, base-relative id,
  exact lookup, update/delete, and document/fragment resolution behavior.
- `packages/agent-runtime`: shared runtime capability declarations, normalized
  approval/input events, and turn-controller rules.

If a shell needs a query or mutation that does not exist, add it to the shared
model/runtime boundary first. Do not work around it by embedding Turtle parsers,
predicate copies, or path templates in CLI/App prompts.
