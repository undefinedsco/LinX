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

## Non-Capabilities

- It must not invent a parallel approval policy from CLI-local tool allowlists.
- It must not recommend that the user create a grant. Grant creation is a user
  decision.
- It must not silently write or mutate Pod state when the target resource type,
  existing match, or required authority is ambiguous.
- It must not author shared Pod paths, RDF predicates, subject templates, or
  Turtle directly. Those belong to `@undefineds.co/models` and `drizzle-solid`.
- It must not fabricate secrets, tokens, file paths, model config, or user
  preferences.

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
