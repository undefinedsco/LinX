# xpod-api-server to LinX Wave A xpod-client-core Mapping Report

**Generated:** 2026-02-16  
**Objective:** Understand what's implemented in xpod-api-server and how it maps to LinX's Wave A xpod-client-core feature plan.

---

## Executive Summary

The xpod-api-server is a **Solid Pod-based Agent OS** that provides:
- A reference implementation of Agent execution with Claude and CodeBuddy SDKs
- Core infrastructure for streaming tool use, auth, and state management
- HTTP/WebSocket APIs following ChatKit protocol (OpenAI compatible)
- Solid auth with DPoP support and Pod-based configuration

**Current Status:** xpod-api-server implements the **server-side** infrastructure. LinX Wave A xpod-client-core focuses on the **client-side protocol layer**—parsing SSE events, managing approval lifecycle, integrating with LinX's Pod schema.

---

## 1. AutonomyCheck Interface

### ✅ What xpod-api-server Has

**Location:** `/src/agents/types.ts`

The agent types define `permissionMode` at the executor level:

```typescript
// ExecutorConfig (line 134-135)
permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

// CodeBuddyConfig (line 153)
permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions';
```

**What it controls:**
- `default`: Standard tool approval mode
- `acceptEdits`: Auto-approve edits without asking
- `bypassPermissions`: Bypass all checks (trust-the-user mode)
- `plan`: Planning-only mode (no execution)
- `dontAsk`: Don't show permission prompts

### ❌ What's MISSING from LinX Requirements

LinX Wave A specifies a **runtime `AutonomyCheck` interface** (6A.3) that needs to be implemented in xpod-client-core:

```typescript
// Required but NOT in xpod-api-server:
interface AutonomyCheck {
  getLevel(): 'manual' | 'semi_auto' | 'full_auto'
  needsApproval(toolName: string, args: Record<string, unknown>): boolean
  matchesWhitelist(command: string): boolean
}
```

**Gap Analysis:**
- xpod-api-server sets permission mode statically at agent config time
- LinX needs **dynamic runtime checks** based on:
  - `autonomy.level` from Pod `settingsTable`
  - Tool name and arguments matching
  - Command whitelist logic
  - User's autonomy settings

---

## 2. Approval Timeout (30s Auto-Reject)

### ✅ What xpod-api-server Has

**Location:** `/src/agents/schema/agent-config.ts`

```typescript
export const AgentConfig = podTable('AgentConfig', {
  ...
  timeout: int('timeout'),  // Line 40 - Agent execution timeout
  ...
});
```

**What's configured:**
- Per-agent timeout (execution timeout, not approval-specific)
- Used in executor lifecycle

### ❌ What's MISSING from LinX Requirements

LinX Wave A (7.5, 7.1) specifies:

```typescript
// Tool approval events should include 30s timeout
event: tool_approval_required
data: {
  toolCallId: "tc_002",
  toolName: "delete_file",
  timeout: 30  // ← Auto-reject after this
}
```

**Gap Analysis:**
- xpod-api-server doesn't emit tool approval events with timeout timers
- No auto-reject logic when timeout expires
- Retry strategy table specifies "自动拒绝 + 通知用户" but not implemented

**Client-side responsibility (xpod-client-core):**
- Parse approval events with timeout field
- Start countdown timer on UI
- Auto-emit rejection when timer expires
- Record "APPROVAL_TIMEOUT" error with autoAction: 'rejected'

---

## 3. Auth Implementation (DPoP, Solid auth, Token Management)

### ✅ What xpod-api-server HAS (Excellent)

**Location:** `/src/api/auth/`

**DPoP Support:**
- `SolidTokenAuthenticator.ts`: Full DPoP verification
  ```typescript
  if (scheme === 'DPoP' && !dpopHeader) {
    return { success: false, error: 'Missing DPoP header' };
  }
  const dpopOptions = dpopHeader ? { header: dpopHeader, method, url } : undefined;
  const payload = await this.verify(authorization, dpopOptions);
  ```
  
**Token Types:**
- Bearer token support
- DPoP token support (complete verification)
- Client credentials (API key)
- Multi-authenticator chain

**WebID Resolution:**
- Extracts `webId` from JWT payload
- Optional `resolveAccountId` callback for WebID → accountId mapping

**Auth Context:**
```typescript
export interface SolidAuthContext {
  type: 'solid';
  webId: string;
  accountId?: string;
  clientId?: string;
  accessToken: string;
  tokenType: 'Bearer' | 'DPoP';  // ← DPoP support
}
```

### ✅ What LinX Wave A Needs (All covered!)

Per 03-xpod-client-core requirements, authentication should:
- ✅ Support DPoP headers (`/src/api/auth/SolidTokenAuthenticator.ts`)
- ✅ Verify Solid access tokens (`@solid/access-token-verifier`)
- ✅ Extract webId claims (line 69)
- ✅ Support Bearer fallback (line 92: `tokenType: scheme === 'DPoP' ? 'DPoP' : 'Bearer'`)

**Client-side (xpod-client-core) needs to:**
- Use same DPoP JWT generation for outgoing approval responses
- Pass auth context through SSE stream parsing
- Store and refresh tokens (if applicable)

---

## 4. SSE Streaming (Tool Use Events)

### ✅ What xpod-api-server HAS

**Location:** `/src/api/chatkit/service.ts`

**Streaming Protocol:**
```typescript
// processStreamingAsBytes() - line 138
async *processStreamingAsBytes(request: StreamingReq, context: TContext): AsyncIterable<Uint8Array> {
  const encoder = new TextEncoder();
  for await (const event of this.processStreaming(request, context)) {
    const data = JSON.stringify(event);
    yield encoder.encode(`data: ${data}\n\n`);  // ← SSE format
  }
}
```

**Event Types (in types.ts, line 545-557):**
```typescript
type ThreadStreamEvent =
  | ThreadCreatedEvent
  | ThreadUpdatedEvent
  | ThreadItemAddedEvent
  | ThreadItemUpdatedEvent
  | ThreadItemDoneEvent
  | ThreadItemRemovedEvent
  | ThreadItemReplacedEvent
  | StreamOptionsEvent
  | ProgressUpdateEvent
  | ClientEffectEvent
  | ErrorEvent
  | NoticeEvent;
```

**ChatKit Handler:**
```typescript
// /src/api/handlers/ChatKitHandler.ts
streamResponse(response, result) {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  
  for await (const chunk of result.stream()) {
    response.write(chunk);  // ← Stream to client
  }
}
```

### ❌ What's MISSING (Tool Use Events)

LinX Wave A (7.1) requires these **specific SSE events**:

```
// NOT implemented in xpod-api-server:
event: tool_use_start
data: {"toolCallId": "tc_001", "toolName": "read_file", "arguments": {...}}

event: tool_use_delta
data: {"toolCallId": "tc_001", "output": "...partial output..."}

event: tool_use_end
data: {"toolCallId": "tc_001", "status": "done", "duration": 320}

event: tool_approval_required
data: {"toolCallId": "tc_002", "toolName": "delete_file", "arguments": {...}, "risk": "high", "timeout": 30}
```

**Gap Analysis:**
- xpod-api-server's ThreadStreamEvent types are generic (ChatKit protocol)
- No specific `tool_use_start`, `tool_use_delta`, `tool_use_end`, `tool_approval_required` events
- These need to be **emitted by Agent executors** (Claude, CodeBuddy) → server → client

**Responsibility split:**
- xpod-api-server: Map executor tool call events → SSE format
- xpod-client-core: Parse SSE events → invoke IncomingStrategy callbacks

---

## 5. Tool Call Lifecycle

### ✅ What xpod-api-server Has (Partial)

**Executor-level handling:**

From `/src/agents/types.ts` (194-200):
```typescript
export type ExecuteMessage =
  | { type: 'system'; executorType: ExecutorType; model: string; tools?: string[] }
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolName: string; toolInput: unknown }
  | { type: 'tool_result'; toolName: string; result: string }
  | { type: 'error'; error: string }
  | { type: 'done'; result: ExecuteResult };
```

**Lifecycle in executor:**
- System message → Tool list initialized
- Text → Content accumulated
- Tool_call → Executor initiated a tool (requires approval?)
- Tool_result → Result captured
- Done → Final result

### ❌ What's MISSING from LinX Requirements

LinX Wave A (7.1) specifies complete lifecycle:

```
calling → waiting_approval → approved → running → done
                           → rejected
calling → running → done      (auto_approved, risk=low)
calling → running → error
```

**Gap Analysis:**
- xpod-api-server executors don't emit approval events
- No risk level calculation
- No differentiation between "auto-approved" (low risk) and "needs_approval" (medium/high)
- No integration with autonomy settings

**Client responsibilities:**
- Monitor tool_use_start events
- Check autonomy settings (AutonomyCheck.needsApproval)
- Emit tool_approval_required if needed
- Send approval/rejection via control command

---

## 6. Approval Persistence (Pod Writing)

### ✅ What xpod-api-server Schema Provides

**Location:** `/src/agents/schema/`

Agent-related Pod tables already defined:
- `AgentProvider` (line 41+): Agent provider configuration
- `AgentConfig` (line 30+): Agent instance config
- `AgentStatus` (line 64+): Runtime status

**BUT NO Approval/Inbox/Audit tables!**

### ✅ What LinX Wave A DEFINES (to implement)

**Location:** LinX `/docs/feature-plan/wave-a/02-contracts-sidecar-events.md`

**Inbox Table** (6A.2):
```typescript
export const inboxTable = podTable(
  'inbox',
  {
    id: id('id'),
    sessionRef: uri('sessionRef'),      // CLI session
    toolCallRef: string('toolCallRef'), // toolCallId
    chatId: uri('chatId'),              // Message
    toolName: string('toolName'),
    toolArguments: text('toolArguments'),
    risk: string('risk'),               // low|medium|high
    status: string('status'),           // pending|approved|rejected|expired
    assignedTo: uri('assignedTo'),
    decisionBy: uri('decisionBy'),      // Who approved
    decisionRole: string('decisionRole'),
    reason: text('reason'),
    createdAt: timestamp('createdAt'),
    resolvedAt: timestamp('resolvedAt'),
  },
  {
    base: '/.data/inbox/',
    type: LINX_SIDECAR.InboxItem,
  }
);
```

**Audit Table** (6A.3):
```typescript
export const auditTable = podTable(
  'audit',
  {
    id: id('id'),
    action: string('action'),           // tool_approved|tool_rejected|etc
    actor: uri('actor'),
    actorRole: string('actorRole'),     // human|secretary|system
    sessionRef: uri('sessionRef'),
    toolCallRef: string('toolCallRef'),
    context: text('context'),           // JSON
    policyRef: uri('policyRef'),
    policyVersion: string('policyVersion'),
    createdAt: timestamp('createdAt'),
  },
  {
    base: '/.data/audit/',
    type: LINX_SIDECAR.AuditEntry,
  }
);
```

### Gap Analysis

**xpod-api-server:**
- Does NOT define inbox or audit tables
- Does NOT implement approval persistence

**xpod-client-core (to implement):**
- Read InboxVocab from Pod
- On approval events, write to inboxTable
  - INSERT new inbox item when tool_approval_required
  - UPDATE status when user approves/rejects
  - Record decisionBy, decisionRole, reason, resolvedAt
- On tool execution completion, write to auditTable
  - action: 'tool_approved' | 'tool_rejected' | 'tool_completed'
  - actor: current user's webId
  - context: JSON with trigger event and reasoning

---

## 7. Session State Management

### ✅ What xpod-api-server Has

**Location:** `/src/terminal/TerminalSession.ts`

```typescript
export type SessionStatus = 'active' | 'idle' | 'terminated';

export interface Session {
  sessionId: string;
  userId: string;
  command: string;
  workdir: string;
  status: SessionStatus;
  createdAt: Date;
  expiresAt: Date;
  ptyPid?: number;
}
```

**Session lifecycle:**
- Created with status='active'
- Transitions to 'idle' on timeout
- Transitions to 'terminated' on exit

### ✅ What LinX Wave A Requires

From `/docs/feature-plan/wave-a/02-contracts-sidecar-events.md` (7.2):

```typescript
interface SessionStateEvent {
  type: 'session.state'
  sessionId: string
  chatId: string
  status: 'active' | 'paused' | 'completed' | 'error'
  previousStatus: string
  tool: 'claude-code' | 'cursor' | 'windsurf'
  tokenUsage: number
  timestamp: string
}
```

**Gap Analysis:**
- xpod-api-server has terminal session management
- LinX needs session events in SSE stream
- Status flow: active → paused → completed (or error)
- Client writes to chatTable (sessionStatus field)

---

## 8. Control Commands (Approve/Reject/Pause/Resume/Stop/Inject)

### ✅ What xpod-api-server Has (Partial)

**Terminal Permission Response** (from `/src/terminal/types.ts`):
```typescript
export type ClientMessageType = 'input' | 'resize' | 'signal' | 'ping' | 'permission_response';

export interface ClientMessage {
  type: ClientMessageType;
  granted?: boolean;  // permission_response
  requestId?: string;
}
```

### ❌ What's MISSING from LinX Requirements

LinX Wave A (7.3) requires comprehensive control commands:

```typescript
interface MCPControlCommand {
  commandId: string;
  type: 'mcp.control';
  command: 'approve' | 'reject' | 'pause' | 'resume' | 'stop' | 'inject_message' | 'approve_pattern';
  sessionId: string;
  toolCallId?: string;          // approve/reject
  message?: string;             // inject_message
  pattern?: string;             // approve_pattern
  inboxItemId?: string;
  actor: {
    actorWebId: string;
    actorRole: 'human' | 'secretary' | 'system';
    onBehalfOf?: string;
  };
  policyVersion?: string;
  timestamp: string;
}
```

**Gap Analysis:**
- xpod-api-server only handles `permission_response` (websocket-level)
- Not HTTP/REST-based control commands
- No support for 'approve_pattern', 'resume', 'stop', 'inject_message'
- No actor/role tracking

**Client responsibilities (xpod-client-core):**
- Emit control commands via OutgoingStrategy.sendApproval()
- Format with actor info (user webId, role)
- Include policy version for audit trail

---

## 9. Agent Executor Integration

### ✅ What xpod-api-server HAS

**Executor Factory Pattern** (`/src/agents/AgentExecutorFactory.ts`):
- Creates executors based on config.executorType
- Supports: 'claude', 'codebuddy'

**Base Executor** (`/src/agents/BaseAgentExecutor.ts`):
- executeAndWait(): consumes stream, returns result
- chat(): multi-turn conversation
- execute(): stream-based execution

**Claude Executor** (`/src/agents/ClaudeExecutor.ts`):
- Uses @anthropic-ai/claude-agent-sdk
- Loads dynamic module (lazy load)
- Sets ANTHROPIC_API_KEY env var

**CodeBuddy Executor** (`/src/agents/CodeBuddyExecutor.ts`):
- Uses @tencent-ai/agent-sdk
- Async query() interface
- accountInfo() support

### ✅ How ChatKit Integrates

**Location:** `/src/api/chatkit/ai-provider.ts`

```typescript
export class VercelAiProvider implements AiProvider {
  async *streamResponse(messages, options) {
    // Get AI config from Pod
    const config = await this.getProviderConfig(context);
    
    if (!config) {
      // Fallback to Default Agent
      yield* this.streamWithDefaultAgent(messages, context);
      return;
    }
    
    // Create provider and stream
    const provider = this.createProvider(config);
    const result = streamText({
      model: provider.chat(model),
      messages,
      ...
    });
    
    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }
}
```

### ⚠️ What Needs Alignment

**xpod-api-server:**
- Executor streaming is text/tool-focused
- Uses Vercel AI SDK (universal adapter)
- No explicit approval event emission

**xpod-client-core needs to:**
- Parse SSE events from VercelAiProvider
- Map to IncomingStrategy callbacks (tool_use_start, tool_approval_required, etc.)
- Integrate with agent-handler (if client has its own agent logic)

---

## 10. Architecture & Data Flow Comparison

### xpod-api-server (Server-side)

```
Pod Solid Storage (RDF)
        ↕ (drizzle-solid ORM)
┌────────────────────────────────────────┐
│ API Layer                              │
│  ├─ ChatKit Handler                   │
│  ├─ Chat Handler                      │
│  └─ Auth (DPoP, Solid Token)          │
└────────────────────────────────────────┘
        ↕ (ChatKit Service, AiProvider)
┌────────────────────────────────────────┐
│ Execution Layer                        │
│  ├─ VercelAiProvider                  │
│  ├─ DefaultAgent Fallback             │
│  └─ Executor Factory                  │
└────────────────────────────────────────┘
        ↕ (SDK-specific)
┌────────────────────────────────────────┐
│ Agent SDKs                             │
│  ├─ @anthropic-ai/claude-agent-sdk    │
│  └─ @tencent-ai/agent-sdk             │
└────────────────────────────────────────┘
```

### xpod-client-core (Client-side, to implement)

```
Web/Mobile UI
        ↕ (Solid Pod access token, DPoP)
┌────────────────────────────────────────┐
│ xpod-client-core Protocol Layer        │
│  ├─ SSE Parser                         │
│  ├─ AutonomyCheck                      │
│  ├─ Approval Lifecycle Manager         │
│  └─ Auth Token Management              │
└────────────────────────────────────────┘
        ↕ (drizzle-solid ORM)
Pod Solid Storage (RDF)
  ├─ messageTable (cache SSE events)
  ├─ inboxTable (approval queue)
  ├─ auditTable (approval audit)
  └─ settingsTable (autonomy.level)
```

---

## 11. Summary: Missing vs. Implemented

| Feature | xpod-api-server | xpod-client-core | Status |
|---------|-----------------|------------------|--------|
| **AutonomyCheck interface** | ❌ | ✅ (to impl) | Config mode only → Runtime checks needed |
| **Approval timeout (30s auto-reject)** | ❌ | ✅ (to impl) | Server config only → Client timer needed |
| **DPoP auth** | ✅ Implemented | ✅ Provided | Reuse server's SolidTokenAuthenticator pattern |
| **SSE streaming** | ✅ Infrastructure | ✅ (to impl) | Generic SSE → Tool-specific events needed |
| **tool_use_start/delta/end events** | ❌ | ✅ (to impl) | Need executor adaptation |
| **tool_approval_required event** | ❌ | ✅ (to impl) | Need approval trigger logic |
| **Tool call lifecycle** | ⚠️ Partial | ✅ (to impl) | Executor → approval → execution flow |
| **Inbox table persistence** | ❌ | ✅ (to impl) | LinX defines schema |
| **Audit table persistence** | ❌ | ✅ (to impl) | LinX defines schema |
| **Session state events** | ⚠️ Terminal only | ✅ (to impl) | Terminal session → ChatKit session mapping |
| **Control commands (approve/reject/etc)** | ❌ | ✅ (to impl) | Terminal permission_response → MCP control |
| **Agent executor integration** | ✅ Implemented | ✅ (to impl) | Consume executor events → SSE mapping |

---

## 12. Recommended Implementation Path

### Phase 1: Protocol Adaptation
1. Define SSE event mapper (Claude/CodeBuddy → tool_use_* events)
2. Implement IncomingStrategy parser for tool events
3. Integrate with OutgoingStrategy for approval sending

### Phase 2: Autonomy & Approval
1. Load AutonomyCheck settings from Pod settingsTable
2. Implement approval timeout timer (30s default)
3. Write approval decision to inboxTable + auditTable

### Phase 3: Persistence & Audit
1. Implement inboxTable CRUD (insert approval, update decision)
2. Implement auditTable logging (action + actor + context)
3. Align with LinX's LINX_SIDECAR vocab

### Phase 4: Session Integration
1. Map terminal session state → chatTable.sessionStatus
2. Emit session.state events to UI
3. Implement pause/resume/stop control commands

---

## 13. Key Takeaways

1. **xpod-api-server is the Backend**: It provides the infrastructure for agent execution, auth, and streaming.

2. **xpod-client-core is the Protocol Layer**: It's responsible for parsing SSE events, managing approval lifecycle, and writing to Pod persistence tables.

3. **AutonomyCheck is Runtime**: Not a static config—needs to check Pod settings at runtime and make dynamic decisions per tool call.

4. **Approval Events are Missing**: xpod-api-server doesn't emit tool_approval_required events; xpod-client-core must request them based on autonomy settings.

5. **Pod Integration is Key**: Both inbox and audit tables are new Pod schemas (Wave A contract), xpod-client-core owns the write logic.

6. **Auth is Solid**: DPoP support exists in xpod-api-server; xpod-client-core should reuse the same patterns for token management and verification.

---

## Appendix: File Locations Reference

### xpod-api-server Key Files

| Component | File | Key Content |
|-----------|------|-------------|
| Agent types | `/src/agents/types.ts` | ExecutorType, ExecutorConfig, permissionMode |
| Executor base | `/src/agents/BaseAgentExecutor.ts` | IAgentExecutor interface, execute() stream |
| Claude executor | `/src/agents/ClaudeExecutor.ts` | Claude SDK integration |
| CodeBuddy executor | `/src/agents/CodeBuddyExecutor.ts` | CodeBuddy SDK integration |
| ChatKit handler | `/src/api/handlers/ChatKitHandler.ts` | POST /v1/chatkit endpoint, SSE streaming |
| ChatKit service | `/src/api/chatkit/service.ts` | Event processing, threading logic |
| ChatKit types | `/src/api/chatkit/types.ts` | ThreadStreamEvent, ChatKitReq/Res |
| AI provider | `/src/api/chatkit/ai-provider.ts` | VercelAiProvider, model streaming |
| Solid auth | `/src/api/auth/SolidTokenAuthenticator.ts` | DPoP verification, webId extraction |
| Terminal types | `/src/terminal/types.ts` | SessionStatus, ClientMessageType |

### LinX Feature Plan Documents

| Wave | Document | Key Content |
|------|----------|-------------|
| A | `/docs/feature-plan/wave-a/03-xpod-client-core.md` | Client protocol spec, AutonomyCheck, tool events |
| A | `/docs/feature-plan/wave-a/02-contracts-sidecar-events.md` | Inbox/Audit schema, event contracts, control commands |

