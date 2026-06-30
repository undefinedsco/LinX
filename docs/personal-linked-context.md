# Personal Linked Context

LinX builds **Personal Linked Context** on top of a Solid Pod.

Personal Linked Context means the user's files, conversations, tasks,
preferences, evidence, decisions, and memories are connected into AI-usable,
user-controlled context. It is a product capability, not a storage table.

Implementation-wise, LinX treats the Pod as a **model-defined semantic file
system**:

```text
Personal Linked Context        product capability
Model-defined semantic FS      storage/model architecture
Solid Pod                      user-owned authority
```

## Core Idea

The Pod is neither "a database with attachments" nor "a raw file browser".

It is:

- user-owned files organized by human and project context;
- typed RDF resources that provide discoverable schemas, relations, indexes,
  state, and authority boundaries;
- model/ORM tooling that makes reads, writes, dry-runs, validation, and
  resource-file linking safe.

## Structured Resources And File Bodies

Use two cooperating layers:

```text
Modeled resource / metadata   centralized, queryable, typed
Document body / artifact      distributed, human-editable, file-primary
```

Put these in modeled resources:

- type and schema;
- status and lifecycle state;
- project, chat, thread, task, run, maker, owner, tags;
- summary/abstract fields needed for search and routing;
- links to document bodies or evidence files;
- approval/input/inbox/control state;
- audit/recovery facts.

Put these in files:

- long-form design notes;
- issue briefs;
- reports;
- logs;
- patches;
- transcripts;
- screenshots;
- benchmark outputs;
- other human-editable or tool-generated artifacts.

The model record must link to the file. Examples:

```text
Issue.document   -> /projects/linx-cli/issues/login-loop.md
Idea.document    -> /projects/linx-cli/ideas/llm-wiki-capabilities.md
Report.document  -> /projects/linx-cli/reports/release-0.3.31.md
Evidence.source  -> /projects/linx-cli/evidence/run-123.log
Evidence.about   -> /.data/runs/2026/06.ttl#run-123
```

## Generic Resource Namespaces

Universal resource kinds do not belong to a product capability namespace.

Use generic modeled storage such as:

```text
/.data/ideas/...
/.data/issues/...
/.data/tasks/...
/.data/runs/...
/.data/reports/...
/.data/evidence/...
/.data/approvals/...
/.data/inbox/...
```

Do not make `/.data/symphony/` the canonical home for `Idea`, `Issue`, `Task`,
`Run`, `Report`, `Evidence`, approval, or inbox resources. Symphony is a
control policy that uses generic resources; it is not the resource namespace.

## `.meta` Boundary

`.meta` is local metadata for a file or container. It may describe content type,
checksum, title, revision, local description, or container-level hints.

`.meta` is not the business index. Do not require clients to recover Issues,
Tasks, Runs, Reports, Evidence, or capture records by recursively scanning
scattered `.meta` files. Shared business truth belongs in modeled resources.

## Model And ORM Responsibilities

`@undefineds.co/models` owns shared resource semantics:

- RDF classes and predicates;
- relation fields such as `document`, `source`, `about`, `project`, `thread`,
  `task`, and `run`;
- required/queryable metadata;
- default resource id and document/source path policy;
- repository/use-case contracts.

`drizzle-solid` owns generic Pod mechanics:

- base-relative id and full IRI resolution;
- exact target lookup/mutation;
- Pod base/session resolution;
- resource preparation and container creation;
- generic dry-run/validation plumbing;
- generic resource-with-document composition, rollback, relinking, and move
  mechanics.

Product shells such as LinX CLI, Web, Desktop, workers, and tools consume these
contracts. They do not create parallel Turtle serializers, path builders, or
predicate vocabularies for shared resources.

## Capture Policy

AI capture starts with the question:

> Is this signal worth durable context?

It must not start with:

> Is this an Idea?

The concrete record type comes from discovery:

```text
thread/session override
  > project policy
  > agent policy
  > user global policy
  > LinX default profile
```

If a matching record type exists, the AI may capture through that model. If no
matching type exists but the signal is durable, the AI should create a local
pending record, `CaptureDraft`, or `ModelingProposal`, then ask for or propose
the missing model/policy. It should not force the content into a default type
just because the skill knows a word such as `Idea`.

## Model Discovery For AI Tools

AI tools need discovery and dry-run surfaces. The intended xpod object flow is:

```bash
xpod obj schemas --json
xpod obj schemas --domain symphony --json
xpod obj describe <schema-or-alias> --json
xpod obj upsert --schema <schema-or-alias> --from - --dry-run --json
xpod obj upsert --schema <schema-or-alias> --from - --commit --json
```

The AI should not hand-write Turtle for modeled resources. If discovery or
describe is missing, fix `@undefineds.co/models`, `drizzle-solid`, or `xpod`
instead of teaching the AI to guess.

## Symphony

When Symphony is on, the current thread enables Symphony's default
control-plane policy. Inside the system-evolution/work-control domain, Secretary
can create or update matching generic work resources directly after discovery
and dry-run.

That policy is scoped. It does not turn every personal memory, preference, or
non-project note into a Symphony resource. Outside the Symphony domain, use the
user's normal capture policy or a modeling proposal.

Symphony context injected into the AI should say:

```text
Symphony is on. You are operating in the Symphony control-plane domain.
Discover current resource types and descriptors through the Pod/model tool
surface before mutating modeled records. Use dry-run before commit.
```

It should not inject a long hardcoded schema list.
