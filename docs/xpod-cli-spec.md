# xpod CLI Boundary

This document defines how LinX, Secretary/Symphony, and local AI agents use the
`xpod` command line as a direct Pod tool surface. It is a boundary document, not
a full xpod product spec.

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

## Resource access modes

Choose the xpod command surface by resource shape.

### Modeled product/control resources

Use modeled commands backed by shared models:

```text
xpod obj ...
```

This applies to resources such as:

- Idea
- Issue
- Task
- Delivery
- Run
- RunStep
- Report
- Evidence when it is structured control data
- ApprovalRequest
- InputRequest
- InboxNotification

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

### RDF inspection

Use RDF-specific commands only when a parsed RDF/triple view is required:

```text
xpod rdf ...
```

Do not make `xpod rdf get` the default verification path for a file-primary
resource. A file may be readable with `xpod get` while RDF parsing or query
transport is slow or broken. In that case the permission check has passed; the
remaining problem belongs to xpod/RDF transport, parsing, or server behavior.

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
- Report command, path, HTTP status, and timeout/error text when diagnostics
  fail; do not silently fallback to a guessed path or hand-written TTL.

## Environment variables

The shared boundary intentionally keeps environment variables small:

- `SOLID_HOME`: root for unified Solid auth and shared app-local Solid state.
- `LINX_HOME`: LinX-specific runtime/cache/archive root.

Feature-specific integration tests may use additional test-only variables, but
product runtime code should not require separate `XPOD_*` auth variables for the
same local Solid identity.
