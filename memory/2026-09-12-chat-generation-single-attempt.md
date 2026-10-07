# Chat generation uses single-attempt semantics

## Symptom

Retryable AI/network failures were persisted in `localStorage` under
`linx.chat.generation-outbox.v1:*`. Reconnect and startup logic replayed those
entries, so stale prompts could be sent after a refresh or later app launch.

## Root cause

The local ChatKit service classified transient provider errors as deferred
generations. The fetch handler turned them into a durable outbox, while the
connectivity hook flushed that outbox on reconnect and on retry timers.

## Resolution

- Provider/network failures now complete the current assistant item once with
  `网络或 AI 上游暂不可用，请稍后重试。`.
- No generation is enqueued or replayed.
- Creating a local ChatKit runtime clears legacy persisted generation entries.
- Reconnect only refreshes current data; it does not resend prompts.
- Offline and Xpod authorization copy tells the user to resend explicitly.

File ingestion and other explicit background-job queues are intentionally
unchanged.

## Verification

- Web TypeScript check passed.
- Chat regression tests passed: 109 tests.
- Added a regression asserting legacy queued prompts are cleared and never
  passed to the generation service.
- Existing local browser session was unavailable for an end-to-end send because
  its Pod connection was still restoring; automated coverage verifies the
  persistence and replay boundary directly.
