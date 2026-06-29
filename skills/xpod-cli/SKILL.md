---
name: xpod-cli
description: Use when LinX or Secretary needs to inspect, import, export, or update Solid Pod resources through the xpod command line; especially user-owned files, RDF resources, descriptor-backed objects, JSON output, and secret-safe operations. This skill is for using xpod CLI in product workflows, not for maintaining the xpod CLI implementation.
---

# Xpod CLI

Use `xpod` as the default terminal surface for Solid Pod operations in LinX.
This replaces ad-hoc `pod_read` / `pod_write` style tools: the product should
prefer one shared CLI contract for Pod files, RDF resources, objects, and
secrets.

## When To Use

- Inspect Pod files or containers before answering questions about stored data.
- Import, export, or link descriptor-backed objects such as chats, tasks,
  sessions, agents, skills, reports, or evidence.
- Read or write RDF resources when the user asks for Pod-level state.
- Manage AI/provider credentials through secret-safe flows.
- Verify that LinX, xpod, or another Solid app wrote the expected resource.

Do not use this skill for xpod CLI repository maintenance. If the task is to
change xpod command behavior or release xpod itself, use the xpod project docs
and maintainer-facing skill in that repository.

## Command Choice

- Use `xpod obj ...` for model/descriptor-backed resources. Prefer this for
  LinX product data because schemas, URI templates, and links belong to
  `@undefineds.co/models`.
- Use `xpod get`, `xpod list`, `xpod put`, `xpod patch`, `xpod delete`, and
  `xpod head` for raw Pod resources when the user is asking about files,
  containers, or exact URLs.
- Use `xpod rdf ...` for graph, subject, and triple-level inspection.
  `xpod rdf query` requires `--sparql`; do not pass the query as a positional
  argument.
- Use `xpod secret ...` for credentials. Never print secret values by default.
- Use `xpod server ...` only when the user asks about the local/server xpod
  process.

Prefer `--json` when the result will be parsed or used to make a decision.
Summarize human-facing output instead of pasting large raw payloads.

## Safety Rules

- Read before write unless the user already gave an exact target and content.
- For destructive operations, explain the target and require explicit user
  confirmation.
- Never expose access tokens, refresh tokens, client secrets, cookies, or
  authorization headers.
- Authentication has one Solid-app source: `$SOLID_HOME/auth/credentials.json`
  (default `~/.solid/auth/credentials.json`). Old `~/.xpod/config.json` /
  `~/.xpod/secrets.json` files are app-local stale files, not Solid auth; if
  only those exist, report unauthenticated.
- For product resources, do not guess paths. Use model-backed `xpod obj`
  commands or inspect existing links first.

## Useful Patterns

```bash
xpod --help
xpod list <pod-url-or-container> --json
xpod get <resource-url> --json
xpod rdf subject <resource-url> --json
xpod rdf query --sparql 'SELECT * WHERE { ?s ?p ?o } LIMIT 10' --json
xpod obj export <type-or-resource> --json
xpod obj import <file-or-stdin> --json
xpod obj link <source> <predicate> <target> --json
xpod secret list --json
```

If `xpod` is not available on `PATH`, report that exact blocker and avoid
pretending Pod state was checked.
