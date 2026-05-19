---
name: pod-storage
description: Resolve durable Pod writes through shared descriptors, Consensus, pod_schema, and pod_storage instead of inventing paths or Turtle.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, pod_read, pod_write
---

# Pod Storage

Use this skill when the user asks AI Secretary or another agent to save
credentials, configuration, grants, preferences, or other durable Pod-backed
data.

## Core Rule

Do not invent Pod paths, RDF predicates, subject templates, or Turtle.

Durable storage semantics belong to `@undefineds.co/models`:

- descriptors,
- resource base paths,
- subject templates,
- field predicates,
- validation,
- repository-backed commits.

## Workflow

1. Restate the storage request in structured fields when possible.
2. Use the injected `udfs` tool for schema lookup and semantic consensus.
   LinX/linx-lite should provide runtime context for remote Consensus; without
   that context, `udfs` can still run local deterministic schema commands.
3. For direct schema lookup, call `udfs schema classes`,
   `udfs schema predicates`, or `udfs schema describe`.
4. For ambiguous natural-language storage requests, call `udfs consensus` with a
   JSON input payload.
   The future service-backed path should use the Responses protocol
   (`/v1/conversations` + `/v1/responses`).
5. Ask the user any returned clarification questions.
6. Continue the same Responses conversation through the `conversation_id`
   request field.
7. Build a domain-shaped DTO from the returned `schemaUri` and field mapping.
8. Optionally call `udfs storage validate --input <json>` before committing.
9. Persist through the shared models ORM/repository, not through hand-written
   Turtle or a resource-specific `udfs` shortcut.
10. Report the schema URI, resource summary, and follow-up status.

## Current MVP Check

The local verification path is the injected `udfs` tool. Do not call back into
`linx`; `udfs` must also work when injected into non-LinX coding agents:

```bash
udfs consensus --input '{"session_id":"sess_123","request":"我要保存这个 Cloudflare token","answers":{"token_type":"tunnel-token"}}' --json
udfs schema classes --uri 'https://vocab.xpod.dev/credential#Credential'
udfs schema predicates --uri 'https://vocab.xpod.dev/credential#Credential'
udfs schema predicates --uri 'https://vocab.xpod.dev/credential#Credential' --field apiKey
```

Inside LinX or another coding-agent shell, AI should use the injected `udfs`
tool:

```bash
udfs consensus --input '{"session_id":"sess_123","request":"我要保存这个 Cloudflare token","answers":{"token_type":"tunnel-token"}}' --json
udfs schema describe 'https://vocab.xpod.dev/credential#Credential'
udfs schema predicates --uri 'https://vocab.xpod.dev/credential#Credential'
udfs storage validate --input '{"schemaUri":"https://vocab.xpod.dev/credential#Credential","operation":"upsert","match":{"service":"infra","providerId":"cloudflare","secretType":"tunnel-token"},"set":{"label":"Cloudflare Tunnel Token","status":"active"}}'
```

Expected outcome:

- clarification question: API token or tunnel token,
- schema URI: `https://vocab.xpod.dev/credential#Credential`,
- predicate mapping includes `apiKey -> https://vocab.xpod.dev/credential#apiKey`,
- descriptor storage: `/settings/credentials.ttl#{id}`,
- validation plan: `/settings/credentials.ttl#infra-cloudflare-tunnel-token`,
- no commit in `udfs`; actual writes go through shared ORM/repository code.
- remote Consensus, when available, is reached through injected
  `UDFS_CONSENSUS_BASE_URL` and `UDFS_CONSENSUS_TOKEN`; do not ask the user for a
  command-line API key.

## Secretary Rules

- Never store secrets in free-form notes.
- Never log full secret values.
- Use validation before risky writes, but persist through model-owned
  repositories/ORM.
- Treat unmodeled durable data as a model proposal flow, not a permanent
  catch-all note.
- User/developer-created descriptors must be validated before activation.

## Low-Level Pod Tools

`pod_read` and `pod_write` are protocol tools, not modeling tools. Use them only
when:

- no shared business model exists yet,
- the operation is explicitly protocol-level,
- or you are inspecting raw Pod state for debugging.

If a shared model exists, use model-owned helpers instead of hand-editing Turtle.
