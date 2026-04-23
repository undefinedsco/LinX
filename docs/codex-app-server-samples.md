# Codex App Server Samples

Date captured: 2026-04-17
Host: local `codex app-server --listen stdio://`
Purpose: freeze real request/response/notification shapes before mapping them into the LinX native-shell data channel.

## Client Requests Observed

### `initialize`

Request:

```json
{
  "jsonrpc": "2.0",
  "id": "initialize",
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "linx-probe",
      "version": "0.1.0"
    },
    "capabilities": {
      "experimentalApi": true
    }
  }
}
```

Response shape:

```json
{
  "id": "initialize",
  "result": {
    "userAgent": "linx-probe/0.121.0 (...)",
    "codexHome": "/Users/ganlu/.codex",
    "platformFamily": "unix",
    "platformOs": "macos"
  }
}
```

### `account/read`

Observed response:

```json
{
  "id": 1,
  "result": {
    "account": {
      "type": "apiKey"
    },
    "requiresOpenaiAuth": true
  }
}
```

### `model/list`

Observed response shape:

```json
{
  "id": 2,
  "result": {
    "data": [
      {
        "id": "gpt-5.3-codex",
        "model": "gpt-5.3-codex",
        "displayName": "gpt-5.3-codex",
        "description": "Latest frontier agentic coding model.",
        "hidden": false,
        "isDefault": true,
        "defaultReasoningEffort": "medium",
        "supportedReasoningEfforts": [...]
      }
    ],
    "nextCursor": null
  }
}
```

### `thread/list`

Observed response shape:

```json
{
  "id": 4,
  "result": {
    "data": [
      {
        "id": "019d9703-95f9-7cd2-b66d-95e8d767e232",
        "preview": "读一下 .omx/handoffs/watch-codex-tui-issues-brief.md",
        "cwd": "/Users/ganlu/develop/linx-cli",
        "status": {
          "type": "notLoaded"
        }
      }
    ],
    "nextCursor": null
  }
}
```

### `skills/list`

Observed response shape:

```json
{
  "id": 5,
  "result": {
    "data": [
      {
        "cwd": "/Users/ganlu/develop/linx-cli",
        "skills": [
          {
            "name": "imagegen",
            "description": "...",
            "enabled": true
          }
        ],
        "errors": []
      }
    ]
  }
}
```

### `config/read`

Observed response shape:

```json
{
  "id": 6,
  "result": {
    "config": {
      "model": "gpt-5.4",
      "model_provider": "custom",
      "approval_policy": "on-request",
      "sandbox_mode": "workspace-write",
      "features": {
        "multi_agent": true
      }
    },
    "origins": {
      "model": {
        "name": {
          "type": "user"
        }
      }
    }
  }
}
```

### `thread/start`

Observed response shape:

```json
{
  "id": 10,
  "result": {
    "thread": {
      "id": "019d9a3d-fd8e-7a12-bfc1-679dffeafc8e",
      "status": {
        "type": "idle"
      },
      "cwd": "/Users/ganlu/develop/linx-cli",
      "turns": []
    },
    "model": "gpt-5-codex",
    "modelProvider": "custom",
    "cwd": "/Users/ganlu/develop/linx-cli",
    "approvalPolicy": "never",
    "approvalsReviewer": "user",
    "reasoningEffort": "xhigh"
  }
}
```

### `turn/start`

Observed response shape:

```json
{
  "id": 11,
  "result": {
    "turn": {
      "id": "019d9a3d-fdae-7371-aa37-0fdc1798093e",
      "items": [],
      "status": "inProgress",
      "error": null,
      "startedAt": null,
      "completedAt": null,
      "durationMs": null
    }
  }
}
```

## Notifications Observed

### `thread/started`

```json
{
  "method": "thread/started",
  "params": {
    "thread": {
      "id": "019d9a3d-fd8e-7a12-bfc1-679dffeafc8e",
      "status": {
        "type": "idle"
      }
    }
  }
}
```

### `thread/status/changed`

```json
{
  "method": "thread/status/changed",
  "params": {
    "threadId": "019d9a3d-fd8e-7a12-bfc1-679dffeafc8e",
    "status": {
      "type": "active",
      "activeFlags": []
    }
  }
}
```

### `turn/started`

```json
{
  "method": "turn/started",
  "params": {
    "threadId": "019d9a3d-fd8e-7a12-bfc1-679dffeafc8e",
    "turn": {
      "id": "019d9a3d-fdae-7371-aa37-0fdc1798093e",
      "items": [],
      "status": "inProgress",
      "startedAt": 1776409247
    }
  }
}
```

### `item/started` and `item/completed` for a user message

```json
{
  "method": "item/started",
  "params": {
    "item": {
      "type": "userMessage",
      "id": "62b96935-ed22-434f-a16a-2a8417c71a5f",
      "content": [
        {
          "type": "text",
          "text": "reply with exactly hi"
        }
      ]
    },
    "threadId": "019d9a3d-fd8e-7a12-bfc1-679dffeafc8e",
    "turnId": "019d9a3d-fdae-7371-aa37-0fdc1798093e"
  }
}
```

```json
{
  "method": "item/completed",
  "params": {
    "item": {
      "type": "userMessage",
      "id": "62b96935-ed22-434f-a16a-2a8417c71a5f",
      "content": [
        {
          "type": "text",
          "text": "reply with exactly hi"
        }
      ]
    },
    "threadId": "019d9a3d-fd8e-7a12-bfc1-679dffeafc8e",
    "turnId": "019d9a3d-fdae-7371-aa37-0fdc1798093e"
  }
}
```

### `mcpServer/startupStatus/updated`

```json
{
  "method": "mcpServer/startupStatus/updated",
  "params": {
    "name": "ai-collector",
    "status": "ready",
    "error": null
  }
}
```

## Implications

- `initialize` and `account/read` are immediate boot requirements for the native shell.
- `thread/start` and `turn/start` already have real response/notification shapes; proxy code should prefer child-first passthrough over local fabrication.
- `item/started` / `item/completed` include user-message samples and should be normalized into persistence/transcript state, even if the frontend shell renders them itself.
- `mcpServer/startupStatus/updated`, `thread/status/changed`, and similar notifications are part of the real protocol surface and should not be silently dropped without an explicit mapping decision.
