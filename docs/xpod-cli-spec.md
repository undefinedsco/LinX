# xpod CLI Spec

This document defines the intended xpod CLI surface for humans, scripts, and AI
agents. xpod is an operations and Pod resource tool. It does not contain
AI-specific business logic and must treat all model/schema resources uniformly.

Status: product/tooling specification, not proof of current LinX runtime
integration. LinX product code that already has an in-process model session
should use `@undefineds.co/models` plus `drizzle-solid`; `xpod` is the portable
CLI/ops surface for humans, scripts, and agents outside that process.

## Boundary With `udfs`

`udfs` from `@undefineds.co/models` is the schema/model contract CLI.

Use `udfs` for:

- listing known model descriptors;
- discovering classes and predicates;
- searching model definitions;
- validating descriptor-backed mutations;
- future schema/model authoring if the models package owns it.

Use `xpod` for:

- authenticated Pod file, RDF, and descriptor-backed object operations;
- import/export from the user's Pod root;
- secret-safe writes;
- local/server xpod administration.

xpod may call or vendor `@undefineds.co/models` descriptors, but it must not
fork the model registry or create a second schema-authoring surface.

LinX product code should not shell out to `xpod` just to perform its own shared
business writes. CLI/App/runtime code that is already inside LinX should use
`@undefineds.co/models` repositories and `drizzle-solid` directly, with xpod
serving as the Pod service/ops surface. The `xpod` command line is the stable
tool surface for humans, scripts, and portable AI agents that do not have an
in-process LinX model session.

## Design Principles

- Paths are Pod-root relative by default, for example
  `settings/credentials.ttl` or `chat/default/index.ttl#this`.
- Commands must resolve and report the effective WebID, Pod root, and base IRI
  in JSON output when that context affects the result.
- The CLI is useful to humans and AI agents. It should be explicit,
  scriptable, and stable; it should not require an AI-specific protocol.
- Every mutating command supports dry-run/plan output before commit.
- Structured output is JSON by default when `--json` is passed.
- Batch commands return item `index` plus machine-readable `code`.
- Secrets are never echoed by default and are never sent to an LLM by xpod.

## Output Contract

All JSON commands should use this shape:

```json
{
  "ok": true,
  "code": "ok",
  "data": {},
  "warnings": []
}
```

Errors should use:

```json
{
  "ok": false,
  "code": "resource_not_found",
  "message": "Resource not found: settings/missing.ttl"
}
```

Mutating commands should return a plan on dry-run and a final decision on
commit. Plans should be useful enough for humans, scripts, AI agents, and
external host policy layers:

```json
{
  "ok": true,
  "code": "plan_ready",
  "data": {
    "operationId": "op_123",
    "webId": "https://id.example/alice/profile/card#me",
    "podRoot": "https://pod.example/alice/",
    "summary": "Patch one workflow evidence object",
    "risk": "normal",
    "resources": [
      {
        "subject": "https://pod.example/alice/.data/workflow/evidence.ttl#ev1",
        "schema": "https://undefineds.co/ns#Evidence",
        "etag": "\"abc\"",
        "change": "patch"
      }
    ],
    "diff": []
  }
}
```

Batch commands should include per-item status:

```json
{
  "ok": false,
  "code": "partial_failure",
  "items": [
    { "index": 0, "ok": true, "code": "ok", "resource": "settings/a.ttl#x" },
    { "index": 1, "ok": false, "code": "predicate_unknown", "message": "..." }
  ]
}
```

## Identity, Auth, And HTTP

xpod must make the acting identity explicit and must not surprise non-
interactive callers with a browser login flow.

Required commands:

```bash
xpod auth status [--json]
xpod auth login [--issuer <url>]
xpod auth logout
xpod auth whoami [--json]
```

Rules:

- `xpod auth login` and `linx login` are two UIs over the same Solid auth
  bootstrap store, `$SOLID_HOME/auth/credentials.json` with `SOLID_HOME`
  defaulting to `~/.solid`. xpod must not create a separate Solid login
  authority under `~/.xpod`; old `~/.xpod/config.json` /
  `~/.xpod/secrets.json` files are app-local stale files and do not count as
  login state.
- When `xpod` is invoked inside an Agent Runtime, inherited runtime authority
  is the preferred auth source. If the runtime has authority to access the
  user's Pod, `xpod` commands spawned by that runtime must be able to perform
  the same Pod operations without a separate `xpod auth login`.
- Inherited agent authority must be consumed as a runtime-provided capability,
  not as a new durable xpod account and not by asking the AI model to manage
  bearer tokens, refresh tokens, client secrets, cookies, or DPoP material.
- Inherited authority takes precedence over the local shared Solid auth source
  inside an agent session. JSON output should report
  `authSource: "agent_runtime"` when this path is used. Old `.xpod` app-local
  files are never an authority source.
- If the runtime advertises inherited authority but xpod cannot consume it,
  commands must fail with `code: "auth_context_unavailable"` or
  `code: "token_exchange_failed"` instead of falling back to another local
  identity. Outside runtime authority, only `$SOLID_HOME/auth/credentials.json`
  can authenticate the command.
- In interactive mode, commands may explain how to log in when no session is
  available.
- In `--json`, CI, or non-interactive mode, missing auth returns
  `code: "auth_required"` and never opens a browser.
- Commands that accept a path may also accept an absolute Pod URL. Output must
  still report the effective Pod root and subject/resource URL.
- If multiple accounts are configured, the selected account must be explicit
  through current Solid auth selection or a command option. xpod should not
  guess from path text when that would change authority.
- `xpod auth status --json` and `xpod auth whoami --json` must be sufficient for
  an AI agent to verify it is using the same acting WebID/Pod root as LinX. If
  legacy `~/.xpod/*` files exist and disagree with `$SOLID_HOME/auth/credentials.json`,
  the shared Solid auth file wins and the legacy files must not be treated as
  authenticated state.

AI agents should not need to learn a private Pod protocol or handle bearer
tokens directly. For raw resource access, xpod should provide a curl-like
authenticated wrapper that injects auth internally and redacts sensitive headers
from output:

```bash
xpod http GET <path-or-url> [--accept <type>] [--out <file>]
xpod http PUT <path-or-url> --from <file> [--content-type <type>] [--if-match <etag>]
xpod http PATCH <path-or-url> --from <file> [--content-type <type>] [--if-match <etag>]
xpod http DELETE <path-or-url> [--if-match <etag>]
xpod curl -- <curl-compatible-args>
```

`xpod curl` is a compatibility surface for agents and scripts that already know
curl semantics. It must not print access tokens, refresh tokens, cookies, or
authorization headers unless a human-only debug flag explicitly requests it.

### Agent Runtime Auth Bridge

The agent bridge is a tool-authority mechanism, not a second login ceremony.

Expected shape:

- The Agent Runtime restores or holds the user's Solid session/access
  capability through its normal login/session layer.
- The runtime exposes that capability to child tools through a local,
  short-lived, non-printing bridge such as a Unix socket, loopback endpoint, or
  runtime-managed credential directory. The bridge should proxy authenticated
  Pod requests or mint tool-scoped request capability without exposing raw
  Solid secrets to the model transcript.
- `xpod` discovers the bridge through explicit environment/config provided by
  the runtime, for example an `authSource=agent_runtime` context plus endpoint
  metadata. The exact variable names are implementation detail, but the
  behavior must be stable and testable.
- `xpod auth status --json` and `xpod auth whoami --json` must show the
  effective WebID, Pod root, base IRI, and auth source. They must not print
  tokens or bridge secrets.
- The bridge should be scoped to the runtime session and cleaned up when the
  runtime exits. Durable user-approved grants and audit facts still belong in
  Pod models; the bridge only transports authority for tool execution.

This lets an AI use ordinary commands such as `xpod file read`,
`xpod obj list`, or `xpod curl -- ...` inside an authorized runtime. The AI does
not need to learn a LinX-only private protocol, and it does not need a separate
xpod login.

## Files

File commands operate on Solid resources from the Pod root.

Required commands:

```bash
xpod file stat <path>
xpod file read <path>
xpod file write <path> --from <local-file> [--content-type <type>] [--if-match <etag>]
xpod file append <path> --text <text> [--content-type text/plain]
xpod file delete <path>
xpod file list <container-path> [--depth 1]
```

`append` is only valid for appendable content types such as text, JSONL, logs,
or explicit RDF/SPARQL update paths. For binary files, xpod must reject append
with `code: "append_not_supported"`.

## RDF

The RDF surface manipulates concrete RDF subjects and triples, not arbitrary app
business semantics.

Required commands:

```bash
xpod rdf get <resource-or-subject>
xpod rdf patch <resource> --insert <ttl-or-file> [--delete <ttl-or-file>]
xpod rdf query --sparql <query-or-file>
xpod rdf classes [--schema <schema-uri>]
xpod rdf predicates [--schema <schema-uri>] [--field <field>]
```

`rdf classes` and `rdf predicates` may delegate to `udfs` / models descriptors
for known schemas. The command name stays under `rdf` because RDF defines the
graph layer; the model registry remains owned by `@undefineds.co/models`.

RDF mutations should support stale-write protection with `--if-match` whenever
the target resource exposes an etag. Query commands must be read-only.

## Object Exchange

xpod should support two stable resource exchange formats:

- file-to-file: copy or transform bytes/resources without interpreting model
  semantics;
- file-to-json-list: export RDF/model-backed objects into JSONL for AI,
  scripts, import review, or offline processing.

Required commands:

```bash
xpod obj export <selector> --format jsonl --out <file>
xpod obj import <file.jsonl> --dry-run
xpod obj import <file.jsonl> --commit
```

Selectors must be precise enough for model-backed control objects. At minimum,
they must support schema URI, subject/resource URI, path, status, relation
filters, limit, and inclusion of revision/etag metadata. This lets portable
agents inspect and update workflow objects without guessing Pod paths or writing
raw Turtle.

Ergonomic command aliases may be added on top of import/export, but they must
still use the same model descriptors and output contract:

```bash
xpod obj get --schema <schema-uri> --subject <subject-or-id>
xpod obj list --schema <schema-uri> [--where <json>] [--limit <n>]
xpod obj upsert --schema <schema-uri> --from <file.jsonl|-> --dry-run
xpod obj upsert --schema <schema-uri> --from <file.jsonl|-> --commit
xpod obj patch --subject <subject> --set <json> [--if-match <etag>] --dry-run
xpod obj patch --subject <subject> --set <json> [--if-match <etag>] --commit
xpod obj link --subject <subject> --predicate <uri-or-field> --object <uri> --dry-run
xpod obj link --subject <subject> --predicate <uri-or-field> --object <uri> --commit
xpod obj delete --subject <subject> [--if-match <etag>] --dry-run
xpod obj delete --subject <subject> [--if-match <etag>] --commit
```

Each JSONL row should be self-describing:

```json
{"op":"upsert","schema":"https://undefineds.co/ns#Credential","match":{"service":"ai","providerId":"openai","secretType":"api-key"},"set":{"label":"OpenAI"}}
```

Multiple classes may appear in one JSONL file. xpod validates each row through
the shared model descriptors when a `schema` is present. Rows without `schema`
are treated as file/RDF-level operations and must declare an explicit path or
subject.

Each exported row should include the resolved `subject` and, when available,
`etag` or revision metadata. Mutating rows may include `ifMatch` so control
planes can reject stale worker results instead of overwriting newer Pod state.

Reverse sync from Pod to business-specific behavior should be evented, not
hardcoded into xpod. xpod emits changed resources/JSON rows; the caller or
framework decides how to turn them into app-specific actions.

Required watch command:

```bash
xpod obj watch <selector> --format jsonl
```

`watch` streams changed rows with stable item `index`, `code`, `subject`,
schema, revision/etag when available, and change kind. It is a transport for
Pod changes, not a Symphony-specific controller.

`watch` should support resume from a cursor when the backend can provide one:

```bash
xpod obj watch <selector> --format jsonl --since <cursor>
```

When no durable cursor is available, xpod must say so in the stream metadata
and include enough subject/etag/change metadata for callers to reconcile with a
fresh `obj list`.

## Descriptor-Backed Objects

xpod must not define business models, Symphony models, RDF predicates, URI
templates, or lifecycle state machines. Those belong to `@undefineds.co/models`.
xpod only provides a descriptor-backed object transport: given a schema
descriptor and a subject, selector, relation filter, or JSONL row, it validates
and reads/writes the corresponding Pod resources.

Descriptor-backed objects must be queryable by descriptor fields and URI
relations, not only by broad path scans. Portable agents need a generic lookup
surface like:

```bash
xpod obj list --schema <schema-uri-or-alias> --where '{"status":"active"}'
xpod obj list --schema <schema-uri-or-alias> --where '{"subject":"<resource-uri>"}'
xpod obj list --schema <schema-uri-or-alias> --where '{"<relationField>":"<resource-uri>"}'
xpod obj list --schema <schema-uri-or-alias> --where '{"fingerprint":"<stable-fingerprint>"}'
```

Field names, aliases, relation direction, status vocabularies, fingerprints,
and closure semantics are model concerns. xpod should accept only descriptor-
known fields unless the caller is intentionally using raw RDF commands.

If a class is missing from `@undefineds.co/models`, xpod should report
`schema_unknown` rather than inventing a private path, predicate, or fallback
object type. LinX product runtime should use in-process repositories for these
objects; portable agents use xpod as the CLI projection of the same model
contract.

## Secrets

Secret handling is special only because the value must not be exposed to model
context or logs.

Required commands:

```bash
xpod secret plan --kind <kind> --provider <provider> [--service <service>]
xpod secret set --kind <kind> --provider <provider> --from-stdin
xpod secret get-metadata <selector>
xpod secret revoke <selector>
```

`secret set` reads from stdin, local secure storage, or an approved file handle.
It must not print the secret value. It may write to the same RDF resources as
ordinary credential models, but output must redact secret fields.

## Administration

Operations unrelated to Pod resources remain xpod administration:

```bash
xpod status
xpod start
xpod stop
xpod logs
xpod config get <key>
xpod config set <key> <value>
```

These commands manage the local/server xpod process and configuration. They
should use the same output contract but are not RDF/model commands.

## Non-Goals

- xpod does not decide where a high-level user memory should be stored without
  model descriptors or caller intent.
- xpod does not define model classes, fields, relation names, status values,
  lifecycle semantics, or URI templates.
- xpod does not run an AI consensus/modeling loop.
- xpod does not own LinX product skills such as Symphony. LinX may bundle a
  user-facing `xpod-cli` skill for Secretary workflows; xpod repository
  maintenance guidance stays in xpod's own docs/skills.
- xpod does not replace `udfs` as the model/schema CLI.
- xpod does not add approval/grant policy. Approval and grant objects are just
  descriptor-backed objects from xpod's perspective.
