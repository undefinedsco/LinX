# Pod Storage Consensus

This document records the target design for letting AI Secretary, user AIs,
developer tools, MCP servers, and LinX runtimes write durable Pod data in a
consistent way.

The problem is not only "where should this data be written?" It is also:

- how the AI discovers the right model,
- how ambiguity is clarified,
- how unmodeled data becomes a model instead of becoming a random note,
- how official, developer, and user models coexist,
- how runtime/tool credentials can be stored before a full business resource
  exists,
- and how all clients avoid inventing their own Pod paths, predicates, and merge
  rules.

## Objective

The goal is:

```text
same kind of thing -> same Pod model -> same storage behavior
```

This must hold even when:

- the request comes from AI Secretary,
- the request comes from a user-owned AI,
- a developer plugin introduces a new tool,
- an MCP server needs credentials,
- the model does not exist yet,
- the user describes the same thing with different words.

The system should not rely on every local AI independently reading docs and
inventing a model. It should provide a shared, queryable, executable modeling
surface.

## Main Concepts

### `@undefineds.co/models`

`@undefineds.co/models` remains the authority for official shared Pod semantics.
It should evolve from "schema/repository package" into "Pod storage contract
package":

- RDF classes and predicates.
- drizzle-solid resources and repositories.
- storage descriptors for AI/tool consumption.
- validation rules for proposed writes.
- commit helpers that write through repositories.
- descriptor exports for official models.

It should not become a runtime-specific UI package. UI, CLI, TUI, MCP, and
runtime adapters should call the shared contract instead of copying storage
logic.

### Descriptor

A descriptor is a machine-readable contract for a Pod model. It is more than RDF
vocabulary documentation.

RDF class/predicate documentation explains meaning. A descriptor also explains
how this product should write and merge the resource.

Descriptor fields should include:

```ts
type PodModelDescriptor = {
  uri: string
  version: string
  source: 'official' | 'verified-community' | 'developer' | 'user'
  trustLevel: 'high' | 'medium' | 'low'
  namespace: string
  class: string
  resourceKind: string
  description: string

  storage: {
    base: string
    resourceIdPattern: string
    /**
     * Deprecated. Present only when the model still maps a short local key
     * through a legacy template. New models should store exact base-relative
     * resource ids directly.
     */
    subjectTemplate?: string
  }

  fields: Record<string, {
    type: 'string' | 'text' | 'number' | 'boolean' | 'timestamp' | 'uri' | 'json'
    predicate: string
    required?: boolean
    secret?: boolean
    array?: boolean
    description?: string
  }>

  uniqueBy: string[]
  writableFields: string[]
  mergePolicy: 'create-only' | 'upsert' | 'patch' | 'append'
  examples: Array<{
    request: string
    match: Record<string, unknown>
  }>
}
```

The descriptor is used by both AI and code:

- AI uses it to generate a typed mutation.
- validator uses it to reject invalid fields or unsafe operations.
- executor uses it to write through the correct repository.
- docs/site use it to explain the model to humans.

### `pod_schema`

`pod_schema` is the local SDK/tool surface for discovering available descriptors.

It is backed by:

- official descriptors exported by `@undefineds.co/models`,
- descriptors from installed developer plugins,
- descriptors stored in the user's Pod,
- cached descriptors resolved from Consensus.

Candidate API:

```ts
pod_schema.describe({ uri: 'https://vocab.xpod.dev/credential#Credential' })
pod_schema.list({ source: 'official' })
```

Low-level schema tools do not accept natural-language intents. Natural-language
classification and clarification belong to the Secretary/Consensus layer, which
can use descriptor metadata and then call deterministic schema/storage tools.

### `pod_storage`

`pod_storage` is the execution surface. It validates and commits mutations using
descriptors and repositories.

Candidate API:

```ts
pod_storage.validate({
  schemaUri: 'https://vocab.xpod.dev/credential#Credential',
  operation: 'upsert',
  match: {
    service: 'infra',
    providerId: 'cloudflare',
    secretType: 'tunnel-token',
  },
  set: {
    label: 'Cloudflare Tunnel Token',
    apiKey: token,
    status: 'active',
  },
})

pod_storage.commit({ planId })
pod_storage.read({ resourceUri })
```

The AI may propose a mutation, but `pod_storage` owns validation and the actual
write. A failed validation returns structured errors that the AI can correct.

### Consensus

Consensus is the shared model registry and modeling advisor.

It has two surfaces:

- a human-readable website, like a model encyclopedia,
- an AI/API surface, used by Secretary, user AIs, developer AIs, and tools.

Consensus is not just keyword search. Its AI/API surface should be
OpenAI-compatible Responses, because that protocol already gives us stateful
conversation continuation, tool calls, structured outputs, and streaming without
inventing a LinX-specific chat API.

The canonical endpoint shapes are:

```text
POST /v1/conversations
POST /v1/responses
```

When there is no existing modeling conversation, the caller first creates a
conversation and stores the returned id:

```ts
const conversation = await consensus.conversations.create({
  metadata: {
    product: 'linx',
    purpose: 'pod-storage',
    activeRuntime: 'cloudflared',
    knownRequirements: 'cloudflare.tunnel-token',
    locale: 'zh-CN',
  },
})
```

Then the caller sends the storage intent through Responses. The input contains
the storage intent plus compact modeling context, and requests structured output
using a fixed Consensus result schema:

```ts
await consensus.responses.create({
  model: 'consensus-modeling',
  conversation: conversation.id,
  input: [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: '我要保存这个 Cloudflare token',
        },
      ],
    },
  ],
  metadata: {
    product: 'linx',
    purpose: 'pod-storage',
    activeRuntime: 'cloudflared',
    knownRequirements: 'cloudflare.tunnel-token',
    locale: 'zh-CN',
  },
  text: {
    format: {
      type: 'json_schema',
      name: 'consensus_modeling_result',
      strict: true,
      schema: consensusModelingResultSchema,
    },
  },
})
```

`consensusModelingResultSchema` should describe one of these result states:

```ts
type ConsensusModelingResult =
  | {
      status: 'resolved'
      schemaUri: string
      fieldMapping: Record<string, unknown>
      confidence: number
      evidence: string[]
    }
  | {
      status: 'candidate_schemas'
      candidates: Array<{
        schemaUri: string
        confidence: number
        difference: string
        evidence: string[]
      }>
    }
  | {
      status: 'needs_clarification'
      questions: Array<{
        id: string
        question: string
        options?: string[]
      }>
    }
  | {
      status: 'needs_model_proposal'
      proposalSeed: {
        title: string
        samples: unknown[]
        reason: string
      }
    }
  | {
      status: 'unsupported'
      reason: string
    }
```

If the intent is ambiguous, Consensus returns a normal response object tied to a
conversation and emits structured clarification content. The client stores the
returned `conversation.id` and continues through the same Responses endpoint.

```ts
{
  id: 'resp_abc',
  conversation: { id: 'conv_modeling_abc' },
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: '这是 Cloudflare API Token 还是 Tunnel Token？',
        },
      ],
    },
  ],
}
```

The raw protocol output carries structured JSON in the response text. SDK helpers
may expose the same payload as a parsed value:

```ts
{
  status: 'needs_clarification',
  questions: [
    {
      id: 'token_type',
      question: '这是 Cloudflare API Token 还是 Tunnel Token？',
      options: ['api-token', 'tunnel-token'],
    },
  ],
}
```

Continue the same modeling conversation by passing the returned conversation id
to the `conversation` parameter. This is the only continuation state the caller
needs to keep for a durable modeling discussion.

Implementation code may store this as `conversationId`, but the wire protocol
must stay Responses-compatible: pass the id through the `conversation` request
field rather than adding a custom `conversationId` field.

```ts
await consensus.responses.create({
  model: 'consensus-modeling',
  conversation: 'conv_modeling_abc',
  input: [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: JSON.stringify({ token_type: 'tunnel-token' }),
        },
      ],
    },
  ],
})
```

Resolution should be returned as structured output, not as a natural-language
blob the caller has to parse:

```ts
{
  status: 'resolved',
  schemaUri: 'https://vocab.xpod.dev/credential#Credential',
  fieldMapping: {
    service: 'infra',
    providerId: 'cloudflare',
    secretType: 'tunnel-token',
  },
  confidence: 0.96,
  evidence: ['https://consensus.undefineds.co/evidence/cloudflare-tunnel-token'],
}
```

Consensus may also return:

- `candidate_schemas`: multiple possible descriptors.
- `needs_clarification`: questions before choosing.
- `needs_model_proposal`: no existing descriptor is sufficient.
- `unsupported`: not enough information or outside supported modeling scope.

`search` can exist as a low-level primitive, but the normal AI entry should be
Responses, because natural language storage intent is often ambiguous and may
need multi-turn clarification.

`previous_response_id` may be used for short, non-durable continuations when a
caller does not want a persisted conversation. For Consensus, persisted
conversation ids are the default because modeling often needs clarification,
review, and later continuation by another client.

The SDK may still expose a convenience helper such as
`consensus.resolveStorageIntent(...)`, but that helper is not a wire protocol.
It should create/reuse a conversation, call `/v1/responses`, parse the structured
result, and return the same result shape. The service boundary stays
Responses-compatible so existing clients, gateways, traces, and agent runtimes
can interoperate.

## Why Consensus Exists

Without Consensus, every user's AI can invent a different model for the same
thing:

- one calls it `domain`,
- one calls it `hostname`,
- one stores it as a note,
- one creates a custom Cloudflare resource,
- one stores only a token and loses route metadata.

Consensus provides a shared place to ask:

```text
What model should this thing use?
```

It should return:

- existing canonical descriptors,
- field mappings,
- differences between candidates,
- clarification questions,
- extension guidance,
- model proposal guidance when no descriptor exists.

This is how the system converges on shared models rather than local AI guesses.

## Modeling Sources

### Official Models

Official models are shipped by `@undefineds.co/models`.

Properties:

- highest trust,
- stable storage contract,
- covered by tests,
- usable by all clients by default,
- suitable for product-critical resources.

Examples:

- credential,
- AI provider,
- AI model,
- chat,
- thread,
- message,
- workspace,
- issue,
- approval,
- audit,
- grant.

### Verified Community Models

Verified community models are maintained in Consensus but not necessarily
bundled into `@undefineds.co/models`.

Properties:

- shared by many users/developers,
- reviewed or promoted,
- versioned,
- has migration guidance,
- can be cached locally by SDKs.

### Developer Models

Developer models come from plugins, MCP servers, runtime adapters, or app
extensions.

Properties:

- installed/enabled by the user or app,
- scoped to a namespace,
- cannot override official model semantics,
- can register descriptors and credential requirements,
- can be promoted later if generally useful.

Example:

```ts
modelsRegistry.register({
  source: 'developer',
  packageName: '@linx/cloudflare-plugin',
  namespace: 'https://undefineds.co/ns/cloudflare#',
  descriptor: cloudflareTunnelDescriptor,
})
```

### User Models

User models live in the user's Pod. They are private descriptors created or
accepted by the user.

Properties:

- useful for personal data shapes,
- lower trust by default,
- require confirmation before runtime-critical usage,
- can later be proposed to Consensus for promotion.

User models should still follow the same descriptor standard. They should not
be arbitrary prompt text.

## Unmodeled Data

Unmodeled data should not be dumped into one permanent bucket. The system should
try to convert it into a model proposal.

The flow is:

```text
unmodeled request
  -> start or continue Consensus `/v1/responses` conversation
  -> match existing descriptor, or return clarification questions
  -> if no match, generate ModelProposal
  -> validate proposal
  -> user/developer accepts
  -> descriptor becomes active
  -> pod_storage writes normal resources through that descriptor
```

Short-lived modeling inbox entries may exist to hold samples while the proposal
is being built, but they are not the final durable data path.
These are internal staging paths; they are not public relation fields.

Suggested staging layout:

```text
/.data/modeling/inbox/
/.data/modeling/proposals/{proposalId}/
/.data/models/{modelId}/
```

### Model Proposal

AI can help with modeling by generating a proposal.

Candidate shape:

```ts
type ModelProposal = {
  title: string
  description: string
  samples: unknown[]
  candidateCanonicalMatches: Array<{
    schemaUri: string
    score: number
    difference: string
  }>
  descriptor: PodModelDescriptor
  migrationPreview?: unknown
  recommendation: 'reuse-canonical' | 'extend-canonical' | 'create-user-model'
}
```

The proposal must pass deterministic validation:

- namespace does not collide,
- official models are not overwritten,
- predicates are valid URIs,
- field types are supported,
- required fields are defined,
- unique keys are meaningful,
- storage base and resource id pattern are safe,
- resource id pattern is safe and produces base-relative ids,
- legacy subject templates are explicitly marked as compatibility-only,
- secret fields are marked,
- round-trip write/read can be demonstrated.

## Credential Special Case

Credentials should not wait for every business resource to be modeled.

If a runtime/tool/MCP declares a credential requirement, `pod_storage` can store
the secret in the generic credential model even if the higher-level business
resource is not modeled yet.

Example requirement:

```ts
type CredentialRequirement = {
  id: 'cloudflare.tunnel-token'
  service: 'infra'
  providerId: 'cloudflare'
  secretType: 'tunnel-token'
  fields: [{ name: 'token'; secret: true }]
  materialize: [
    { kind: 'env'; name: 'CLOUDFLARED_TUNNEL_TOKEN'; from: 'token' }
  ]
  matchKey: ['service', 'providerId', 'secretType']
}
```

The credential itself can be represented by the official credential descriptor:

```ts
{
  schemaUri: 'https://vocab.xpod.dev/credential#Credential',
  match: {
    service: 'infra',
    providerId: 'cloudflare',
    secretType: 'tunnel-token',
  },
  set: {
    label: 'Cloudflare Tunnel Token',
    status: 'active',
  },
}
```

The Cloudflare tunnel route object is different. Hostname, target URL, tunnel
id, policy, and access route may need a dedicated model. Until that exists,
only the credential should go to the generic credential resource.

## AI Secretary Flow

Secretary should not write paths or Turtle. It should call tools:

```text
Secretary
  -> udfs consensus --input <json> when descriptor choice is unclear
  -> pod_schema describe for local descriptors
  -> pod_storage validate/commit for actual Pod writes
```

Secretary can:

- interpret the user's goal,
- ask Consensus for model guidance through `/v1/responses`,
- ask user clarification questions returned by Consensus,
- propose a storage action based on descriptor output,
- explain validation errors,
- report saved results.

Secretary must not:

- invent storage paths,
- invent predicates,
- bypass repositories,
- treat a local note as a consumable config,
- create a formal model without validation and user/developer acceptance.

## Consumer Integration

Consumption should not be implemented separately by every client.

CLI/App/TUI responsibilities:

- collect user input,
- show confirmation or clarification UI,
- provide a Pod session to the shared SDK,
- display storage result summaries.

Runtime/tool/MCP responsibilities:

- declare credential requirements,
- declare model descriptors if they introduce durable data,
- consume resolved credentials/materialized config from the runtime launcher.

Shared SDK responsibilities:

- descriptor lookup,
- Consensus client,
- validation,
- commit,
- credential resolution,
- status write-back.

This means a tool or MCP server should not parse the user's Pod directly. It
declares what it needs; LinX resolves and injects it.

## Context For Consensus

Consensus should be conversational through the Responses protocol, but it should
receive modeling context, not entire chat history.

Useful context:

- product,
- purpose,
- locale,
- current surface,
- active runtime/tool,
- known credential requirements,
- candidate descriptors,
- user's clarification answers,
- small masked samples.

Avoid passing:

- unrelated chat history,
- huge raw logs,
- full Pod dumps,
- implementation-private shell state.

The point is to provide enough context to disambiguate, not to make Consensus a
general chat memory sink.

## Data Boundary

Consensus does not keep a full chat copy. The complete conversation stays in the
user's Pod as `Chat`, `Thread`, and `Message` resources.

The public Consensus Pod only stores sanitized modeling artifacts:

- `ModelingSample`
- `SchemaEvidence`
- `DescriptorProposal`
- `JuryVote`
- `ConsensusDecision`
- `PromotionRecord`

Public samples may keep `sourceMessage` / `sourceThread` URI references or a
hash for provenance. Raw chat excerpts only enter the public Pod with explicit
user authorization, and such writes must carry consent and provenance records.
That makes Consensus a modeling system, not a chat synchronization service.

## Fingerprints And Promotion

To converge models over time, descriptors should have semantic fingerprints.

The fingerprint should normalize:

- class meaning,
- field meanings,
- value types,
- cardinality,
- relation shape,
- unique keys.

It should avoid unstable labels and wording. Two descriptors with similar
fingerprints can be considered equivalent, extendable, or migratable.

Promotion path:

```text
user model -> developer/community model -> verified community -> official
```

Promotion should include:

- descriptor version,
- migration map,
- equivalentClass/sameAs links when appropriate,
- deprecation notes for older user/developer descriptors.

## Minimal Implementation Order

1. Add official descriptors for current `@undefineds.co/models` resources.
2. Add `pod_schema.describe` and local descriptor registry.
3. Add `pod_storage.validate` for descriptor-backed upserts.
4. Add generic credential requirement support.
5. Wire CLI/App/Secretary storage actions to `pod_storage`.
6. Add Consensus `/v1/responses` client support with persisted conversation ids.
7. Add developer/user descriptor registry.
8. Add ModelProposal validation and activation.
9. Add human Consensus site and promotion workflow.

The first useful milestone is not the full registry. It is making existing
official resources queryable and writable through a single descriptor-backed
contract.
