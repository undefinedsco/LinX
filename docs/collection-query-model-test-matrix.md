# Collection Query Model Test Matrix

This matrix keeps shared collection behavior centralized while requiring each
module to prove only its own persistence boundary against a real private xpod.

| Query model | Shared contract | Module integration evidence |
| --- | --- | --- |
| Singleton resource | Exact IRI read/update and query invalidation in `profile/collections.test.ts` | Profile WebID resource read, update, reread, and restore |
| Pod table collection | Hydration, cache reuse, identity, optimistic CRUD, rollback, subscription coalescing, and Strict Mode reuse in the stores/web collection contract suites | Chat, Contacts, Favorites, Inbox, Model Services, and Symphony each round-trip one representative private Pod resource |
| Raw LDP resource | Files cache transaction and rollback cases in `files/collections.test.ts` | Files creates, lists, reads, updates, and deletes a private Pod file through the resource and mutation collections |
| Derived live query | One hydration, reactive derivation, optimistic state, and rollback in `live-query-contract.test.tsx` | Covered by modules only when their mapping or join semantics differ from the shared contract |
| Subscription projection | Shared physical subscription, remote upsert/delete, invalidation fallback, and event coalescing in `pod-collection.test.ts` | Module tests add subscription cases only when event identity or projection rules are module-specific |
| Database rebinding | Lazy first bind, hydrated refetch, cancellation, teardown, and variable collection counts in `pod-collection-rebind.test.ts` | Contacts and Model Services retain only identity deduplication and failed-bind retry tests |
| Local view metadata | Normalization belongs to the structured view domain | Files tests malformed storage, unsafe stored shapes, and document-key isolation without restoring the removed Pod sidecar |

## Coverage rule

Do not repeat generic insert/update/delete and rollback tests in every module.
A module integration test is required when it introduces at least one of:

- a distinct resource addressing model;
- a distinct RDF-to-product projection;
- a multi-resource join or snapshot;
- raw LDP behavior outside the ORM table path;
- module-specific subscription identity;
- module-specific optimistic cache projection.

Mocked module tests remain responsible for failure branches and deterministic
cache timing. Real xpod integration tests prove authentication, private Pod
access, RDF persistence, and the module boundary end to end.

## Module evidence

| Module | Real xpod boundary | Module-only unit responsibility |
| --- | --- | --- |
| Chat | Chat, thread, message, participant metadata, and Secretary resources | Account-scoped keys, storage routing, aggregate subscription, Secretary bootstrap |
| Contacts | Solid and external contact RDF shapes | Group semantics, chat linkage, durability compensation, subscription and bind identity |
| Favorites | Favorite RDF shape | Legacy target normalization, cross-module star hooks, subscription wrapper |
| Inbox | Approval RDF shape | Aggregate subscription, proposal routing, audit and notification behavior |
| Model Services | Credential, provider, and model RDF shapes | Bind identity, failed-bind retry, write compensation |
| Profile | WebID-addressed singleton resource | Exact IRI addressing and cache invalidation |
| Symphony | Representative private control resource | Eight-resource snapshot, ordering, identity, aggregate disposal |
| Files | Raw private LDP create/list/read/update/delete | Resource cache transactions, rollback, projections, local view metadata |
