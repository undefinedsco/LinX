# AI Secretary Storage Modeling TODO

## Problem

When AI Secretary helps a user save configuration, credentials, grants, preferences, or other durable state, the act is itself a modeling decision.

The secretary must not guess Pod paths or hand-build Turtle. It needs enough shared model context to decide whether the user intent should:

- update an existing resource,
- add a new resource,
- link to an existing resource,
- ask the user for missing authority or disambiguation,
- or refuse because the target model is unsupported.

This means "save this for me" cannot be treated as a blind append. Before a write, the secretary needs to know what already exists in the user's Pod, what resource type the new information belongs to, and whether the correct operation is merge/update, create, link, or ask.

If the secretary cannot determine that safely, it should stop at a proposed plan and ask the user before mutating durable state.

## Current Boundary

Durable Pod storage semantics belong to shared models and drizzle-solid:

- resource base paths,
- subject templates,
- RDF predicates,
- relation fields,
- id/resource-id normalization,
- repository/query helpers,
- write/update/delete behavior.

CLI/App/AI Secretary should produce domain-level intents and DTOs, not paths:

- `providerId`,
- `credentialId`,
- `service`,
- `modelId`,
- `apiKey`,
- `grant title/body/scope`,
- user confirmation metadata.

The actual Pod location must come from `@undefineds.co/models` resources and repositories.

## Required Capability

Before writing on behalf of the user, AI Secretary needs a storage modeling context provider that can expose:

- available shared resource types and their user-facing meaning,
- schema/resource identity rules without requiring prompt-side path guessing,
- existing matching resources for merge-vs-create decisions,
- conflict and duplication signals, such as "this looks like an existing provider/model/credential/grant",
- required fields and safe defaults,
- write capabilities for create/update/link/delete,
- ambiguity and consent requirements.

This should be a shared capability used by CLI and App, not a TUI-only helper.

## TODO

- Define a shared storage-planning API that turns user intent into a typed plan before any Pod mutation.
- Add model-owned lookup helpers for each supported save target so the secretary can inspect existing resources before deciding create vs merge/update.
- Make the plan explain the target resource type, matched existing resource if any, proposed mutation, and confidence.
- Require user confirmation when the plan has ambiguity, conflicts, low confidence, missing required fields, or no matching grant.
- Keep CLI/App prompts out of path construction; prompts may request a storage plan, but only shared model/runtime code may resolve resources and write them.
- Record failed or deferred Pod writes as sync warnings without blocking unrelated user work.

## Decision Points To Resolve

- How the secretary discovers candidate resource types for an intent.
- How it retrieves enough existing Pod state to decide merge vs new.
- How it explains the proposed write to the user before committing.
- Which writes can be performed automatically under an existing grant.
- How shared model docs/schema are made available to the secretary without duplicating path logic in prompts.
- How local-first sync reports pending/failed Pod writes without blocking the active interaction.

## Non-Goals

- Do not let AI Secretary directly author resource paths.
- Do not put CLI/App-specific predicate or subject-template knowledge into prompts.
- Do not add another credential/config storage format.
- Do not rely on static prompt text as the source of truth for storage paths.

## Near-Term Implementation Direction

Create a shared storage-intent API in `@undefineds.co/models` or a nearby shared runtime package:

```ts
type StorageIntent =
  | { kind: 'ai-credential'; providerId: string; apiKey: string; baseUrl?: string }
  | { kind: 'ai-model'; providerId: string; modelId: string; displayName?: string }
  | { kind: 'grant'; title: string; body: string; tags?: string[] }

type StoragePlan =
  | { action: 'create'; resource: string; summary: string; dto: unknown }
  | { action: 'update'; resource: string; target: string; summary: string; patch: unknown }
  | { action: 'ask'; reason: string; options: string[] }
  | { action: 'unsupported'; reason: string }
```

The secretary can reason over the returned plan and user-facing summary, while the shared implementation owns exact resource writes.
