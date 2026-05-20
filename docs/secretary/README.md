# AI Secretary Capabilities

This directory is the home for AI Secretary capability design notes.

AI Secretary documents should cover what the secretary can decide or do on behalf of the user, what shared model/runtime context it needs, and when it must ask the user before taking action.

## Current Notes

- [Capability contract](./capability-contract.md) — what AI Secretary may decide, what context it needs, and when it must defer to the user.
- [Storage modeling TODO](./storage-modeling-todo.md) — how the secretary plans durable Pod writes instead of guessing paths or blindly appending data.
- [Pod Storage Consensus](./pod-storage-consensus.md) — descriptor-backed Pod storage, Consensus Responses conversations, official/developer/user model sources, and unmodeled data proposal flow.
- [Consensus tools and skills](./consensus-tools-and-skills.md) — LinX-side Secretary tool flow, `pod_schema` / `pod_storage` usage, and CLI verification command.

## Documentation Boundary

Keep Secretary-specific product and capability rules here.

Shared storage semantics, RDF predicates, resource paths, subject templates, and repository behavior still belong in `@undefineds.co/models` and drizzle-solid documentation. This directory may link to those contracts, but should not redefine them.
