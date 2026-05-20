# Consensus Tools And Skills

AI Secretary uses Consensus and shared model tools to store durable data without
guessing Pod paths.

## Runtime Tools

### `consensus.responses.create`

Starts or continues a modeling conversation through the Responses protocol.

The wire contract is:

- `POST /v1/conversations`
- `POST /v1/responses`
- continuation id goes in the Responses `conversation` field

Do not introduce `consensus.ask({ conversationId })` as a service protocol.

### `pod_schema.describe`

Returns the official descriptor for a schema URI. In the MVP this is exported by
`@undefineds.co/models` as `podSchema.describe`.

### `udfs`

LinX/linx-lite exposes one `udfs` tool for Undefineds Pod data semantics. The
tool must also work when injected into another coding agent. Remote Consensus
should use runtime context injected by LinX/linx-lite, not a user-provided
command-line API key. Without runtime context, local schema lookup and
validation still work as deterministic fallbacks.

Current subcommands:

- `udfs consensus --input '<json>'` for a high-level storage conversation.
- `udfs schema describe ...` for local descriptor lookup.
- `udfs schema classes ...` for RDF class lookup.
- `udfs schema predicates ...` for field predicate lookup.
- `udfs storage validate --input '<json>'` for descriptor-backed mutation
  validation.

Runtime injection:

- `UDFS_CONSENSUS_BASE_URL` points at the LinX/linx-lite Consensus-capable API.
- `UDFS_CONSENSUS_TOKEN` is a short-lived runtime token injected by the host.
- The command does not expose `--api-key`; user credentials should not be typed
  into tool arguments.

### `udfs storage validate`

Builds a descriptor-backed mutation plan. It validates:

- descriptor exists,
- operation is supported,
- unique match fields are present,
- set fields are writable.

### ORM / Repository Commit

Commits are not a `udfs` CLI responsibility. After schema lookup or Consensus,
the Secretary should build a domain-shaped DTO and call the shared
models ORM/repository API. `udfs storage validate` can be used as a
pre-commit safety check, but it should not replace repository-owned writes.

## Tool Verification

```bash
udfs consensus --input '{"session_id":"sess_123","request":"我要保存这个 Cloudflare token","answers":{"token_type":"tunnel-token"}}' --json
udfs schema classes --uri 'https://vocab.xpod.dev/credential#Credential'
udfs schema predicates --uri 'https://vocab.xpod.dev/credential#Credential'
```

AI Secretary should use the injected `udfs` tool directly. Do not add a LinX
wrapper around this command; the tool must also work when injected into other
coding agents.

```bash
udfs consensus --input '{"session_id":"sess_123","request":"我要保存这个 Cloudflare token","answers":{"token_type":"tunnel-token"}}' --json
udfs schema describe 'https://vocab.xpod.dev/credential#Credential'
udfs schema predicates --uri 'https://vocab.xpod.dev/credential#Credential'
udfs storage validate --input '{"schemaUri":"https://vocab.xpod.dev/credential#Credential","operation":"upsert","match":{"service":"infra","providerId":"cloudflare","secretType":"tunnel-token"},"set":{"label":"Cloudflare Tunnel Token","status":"active"}}'
```

The command must prove:

- Secretary would ask the Cloudflare token clarification question.
- Consensus resolves to `schemaUri: https://vocab.xpod.dev/credential#Credential`.
- `podSchema.describe` finds the descriptor.
- `udfs schema predicates` exposes field-to-predicate mappings.
- `createPodStorage().validate` produces `/settings/credentials.ttl#infra-cloudflare-tunnel-token`.
- no durable write happens through `udfs`; commits go through shared
  ORM/repository code.

## Current Gap

The MVP validates the modeling and storage contract locally. The next
implementation step is wiring the resolved descriptor and field mapping into
repository-backed writes in `@undefineds.co/models`.
