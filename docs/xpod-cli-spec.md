# xpod CLI Boundary

This document defines how LinX, Secretary/Symphony, and local AI agents use the
`xpod` command line as a direct Pod tool surface. It is a boundary document, not
a full xpod product spec.

For the product/storage model behind these rules, see
`docs/personal-linked-context.md`.

## Purpose

`xpod` CLI is the local direct interface to Solid Pod resources:

- read/write files in the Pod;
- inspect RDF when needed;
- operate modeled resources through shared models;
- expose auth status for the current Solid authority.

It is not a second LinX shell, not a backend runtime, and not a place to
redefine LinX/Symphony product state machines.

## Auth authority

All local Solid apps use one auth authority:

```text
${SOLID_HOME:-~/.solid}/auth
```

That auth root owns:

- `credentials.json`;
- `account.json`;
- OIDC session storage;
- client credentials when the user chooses the Solid client-credentials login
  path.

`~/.xpod`, `~/.linx`, `LINX_HOME`, and `${SOLID_HOME}/apps/<app>` are app
runtime/cache/archive roots. They may hold logs, local runtime sessions,
archives, or app cache, but they must not become independent login authorities.
Having only an old `~/.xpod` config does not mean the user is logged in.

Canonical identity fields are:

- `webId`
- `podRoot`
- `server`

Do not introduce app-specific synonyms such as `xpodWebId`, `xpodPodRoot`, or
`linxWebId` in shared auth, runtime projections, or agent prompts.

## Tool ownership vs app ownership

`xpod` is the neutral Solid/Pod command surface. LinX may invoke it from
Secretary, Symphony, diagnostics, or tests, but LinX does not own xpod's command
language, RDF parser, auth store, or package lifecycle. Conversely, xpod must not
define LinX/Symphony product state machines just because it can read and write
the same Pod.

xpod commands are a tool interface, not a product transcript. When an AI uses
xpod inside LinX, command output is evidence for the acting agent. The visible
chat should normally summarize the outcome, resource path, status, and blocker.
Raw command transcripts are reserved for explicit diagnostics or when the raw
output is the smallest actionable evidence.

Package fixes follow the owning boundary:

- a broken LinX prompt/projection, Symphony routing rule, TUI copy, or lifecycle
  integration is a LinX release;
- a broken `xpod auth`, `xpod get/put`, `xpod rdf`, or `xpod obj` behavior is an
  xpod release;
- a missing shared resource shape, id helper, repository query, or model-backed
  command contract belongs in `@undefineds.co/models` and then xpod/LinX consume
  the released version.

Do not compensate for an xpod/model gap by teaching LinX or Secretary to hand
craft Turtle for modeled resources. Fix the owner and upgrade the dependency.

LinX and xpod may live in the same repository or release train, but they still
have separate package ownership. A LinX bug in Symphony prompt projection,
command routing, TUI rendering, or lifecycle restart requires a LinX release.
An xpod bug in auth status JSON, `get/put`, RDF parsing, object descriptors, or
command UX requires an xpod release. If a LinX fix depends on an xpod fix,
release xpod first, then upgrade LinX to the published xpod version.

## Session reuse

LinX, xpod CLI, and AI agent runtimes should all consume the same authenticated
Solid session/fetch derived from the unified auth root.

- Browser OIDC consent and `clientId:clientSecret` are two ways to obtain a
  Solid session.
- Runtime code should use the resulting session/fetch. It should not care which
  login method produced it.
- Provider API keys for OpenAI/Anthropic/DeepSeek/etc. are different resources.
  Do not treat Solid client credentials as provider API keys.

When xpod CLI is invoked from a LinX agent runtime, it should work without an
extra xpod login. If `xpod auth status` reports a different `webId` or `podRoot`
from the active LinX session, stop and report the mismatch.

Machine-readable auth checks must keep stdout and stderr separate. Agents should
parse JSON from stdout and capture warnings/errors separately; do not pipe
`2>&1` into a JSON parser and then treat Node warnings as an auth failure. If
`xpod auth status --json` writes non-JSON to stdout, that is an xpod CLI bug. If
warnings appear on stderr but stdout contains valid JSON, auth status is still
determined by the JSON payload.

## Resource access modes

Choose the xpod command surface by resource shape.

### Model discovery before writes

AI agents must not rely on prompt memory to know which product resource types
exist. Before writing a modeled resource, the agent should discover the current
Pod/project/agent policy and the available model descriptors, then validate the
write with dry-run.

The desired xpod object contract is:

```text
xpod obj schemas --json
xpod obj schemas --domain <domain> --json
xpod obj describe <schema-or-alias> --json
xpod obj upsert --schema <schema-or-alias> --from <jsonl-or-stdin> --dry-run --json
xpod obj upsert --schema <schema-or-alias> --from <jsonl-or-stdin> --commit --json
```

`describe` should expose at least:

- schema URI and stable alias;
- fields, required fields, and relation fields;
- id semantics and whether an explicit id is exact;
- default resource path and document/source path policy;
- example input rows;
- validation warnings and errors.

`dry-run` must show the final resource URL, subject IRI, linked file paths, and
planned mutations before a write is committed. It should reject common path
composition mistakes such as passing a full project path where a slug/key was
expected and producing duplicated paths like
`projects/foo/ideas/projects/foo/ideas/bar`.

If discovery/describe is unavailable for a modeled resource, LinX/Secretary
should report the missing command/model surface or create a local pending draft.
It should not hand-write Turtle or guess paths just because the AI recognizes a
name such as `Idea`.

Capture should use the user's Pod/project/agent record-type policy first. If no
matching type exists, create a `CaptureDraft`/`ModelingProposal` or local
pending record instead of forcing the content into a LinX-default type. Symphony
may provide an additional default control-plane policy while it is on, but that
policy only applies inside the system-evolution/control-work domain.

### Modeled product/control resources

Use modeled commands backed by shared models:

```text
xpod obj ...
```

This applies to resources such as:

- discovered user/project record types such as Idea, Decision, Finding, or
  project-specific capture types;
- control/work resources such as Issue, Task, Delivery, Run, RunStep, Report,
  ApprovalRequest, InputRequest, and InboxNotification;
- Evidence when it is structured control data or metadata for a file-primary
  evidence artifact.

Do not hand-patch Turtle for these records from LinX or Secretary. If the model
or command is missing a capability, fix `@undefineds.co/models`, drizzle-solid,
or xpod CLI instead of bypassing the model layer.

### File-primary resources

Use raw file commands:

```text
xpod get <path>
xpod put <path> --from <file> --content-type <type>
```

This applies to file-primary resources such as long reports, evidence documents,
Markdown notes, logs, screenshots, or other assets where the file content is the
primary artifact and metadata is secondary.

If file-primary resources need queryable facts, attach metadata through the
shared model/repository layer instead of inventing a second control record. The
file body remains the primary artifact; RDF/object metadata should only contain
facts needed for lookup, routing, audit, synchronization, or recovery.

Typical split:

- `xpod put reports/<...>.md --from <file>` stores the long report body;
- modeled metadata links the report to Issue/Task/Run/Evidence and records
  summary, status/outcome, maker, source, and timestamps as needed;
- clients render or subscribe from the modeled metadata, then fetch the file
  body when the user opens the artifact.

### RDF inspection

Use RDF-specific commands only when a parsed RDF/triple view is required:

```text
xpod rdf ...
xpod rdf query --sparql '<SELECT ...>'
```

`xpod rdf query` does not accept the SPARQL query as a positional argument. Use
`--sparql` with either the query string or a local file path.

Do not make `xpod rdf get` the default verification path for a file-primary
resource. A file may be readable with `xpod get` while RDF parsing or query
transport is slow or broken. In that case the permission check has passed; the
remaining problem belongs to xpod/RDF transport, parsing, or server behavior.

## Modeled vs file-primary verification

A successful `xpod put` followed by a successful `xpod get` proves byte-level Pod
read/write for a file-primary resource. It does not prove RDF parsing, model
query, SPARQL, or object mapping health. Keep diagnostics explicit about which
layer was exercised:

- `xpod get/put` verifies raw resource I/O;
- `xpod rdf ...` verifies RDF parsing/query behavior;
- `xpod obj ...` verifies shared model descriptors, repositories, and object
  command mapping.

A timeout or parse failure in the RDF/object layer must be reported as that
layer's failure, not reclassified as missing Pod permission when raw `get` works.

## Secretary and Symphony usage

When Symphony is on, Secretary may use xpod CLI as the direct Pod tool surface,
but it must keep product messages and runtime projections separate.

Rules:

- Verify `xpod auth status` / `whoami` matches the active LinX session before
  mutation.
- Do not ask the model or user to handle tokens when the LinX runtime already
  has an authenticated Solid session.
- Use `xpod obj` for modeled Symphony resources.
- Use raw `get`/`put` only for file-primary evidence or diagnostics.
- Do not print internal xpod guardrails, prompt wrappers, or routing text into
  the visible chat transcript.
- Do not paste routine xpod command transcripts as the normal answer. Summarize
  the result unless the user requested debug detail or the raw output is the
  evidence needed to explain a blocker.
- Report command, path, HTTP status, and timeout/error text when diagnostics
  fail; do not silently fallback to a guessed path or hand-written TTL.
- For JSON diagnostics, keep stderr warnings separate from stdout JSON before
  parsing; a warning banner is not itself proof of missing login.

## Environment variables

The shared boundary intentionally keeps environment variables small:

- `SOLID_HOME`: root for unified Solid auth and shared app-local Solid state.
- `LINX_HOME`: LinX-specific runtime/cache/archive root.

Feature-specific integration tests may use additional test-only variables, but
product runtime code should not require separate `XPOD_*` auth variables for the
same local Solid identity.
