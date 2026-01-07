# Chat App Spec (Draft)

## Data Model (drizzle-solid, Pod storage)
- **Chats**: one row per chat (list pane item). Fields: `subject/@id`, `title`, `starred` (bool), `updatedAt`, `createdAt`, `provider` (slug), `model` (string), `participants` (contact ids; contacts can be human or AI), `lastMessagePreview`, `lastMessageAt`.
- **Threads**: belong to a chat. Fields: `subject/@id`, `chatId`, `title` (auto-name allowed), `starred` (bool), `createdAt`, `updatedAt`.
- **Messages**: belong to a thread. Fields: `subject/@id`, `threadId`, `authorContactId`, `role` (user/assistant/system), `content` (text for v1), `createdAt`.
- **Storage paths**: drizzle-solid `resourcePath` per table, writable by the user’s Pod. (Credential data remains in its own container.)

## UI Structure
- **Left Pane (Chats list)**: shows chats, ordered by `starred` first then `lastMessageAt` desc. Shows title, last message snippet/time, provider logo. Search filters via TanStack Query cache. Actions: star/unstar, delete. “Add” button (next to search) creates a chat from contacts or an ad-hoc group, then opens it.
- **Right Pane** (hidden by default):
  - **Role settings**: top section; “Edit” opens a modal to change role/system prompt. Applies to the active chat.
  - **Threads**: lower section; search within threads; list threads for the active chat (newest → oldest). Actions: star/unstar, rename/auto-name. “New thread” control also accessible near the composer send area.
- **Content Pane (active thread)**: uses OpenAI ChatKit component for history + composer. Messages from the selected thread; send from composer.

## Provider / Model Behavior
- Provider+model are set at the chat level (not per thread). Thread inherits the chat’s provider/model.
- Model switcher lives in the chat context (e.g., header/composer). Switching updates all subsequent sends for that chat.
- If the selected provider lacks an API key, surface a prompt/card to add the key before sending; resume send after key is saved.

## Interactions & Flows
- **Create chat**: choose contacts/group → set provider/model (default allowed) → open content pane with a first thread.
- **Starred**: unified flag; starred chats float to top; starred threads float within the thread list (closest first).
- **Search**: chats list search by title/last message; thread search by title (and optional last message). Uses client cache (TanStack Query) to avoid extra Pod reads.
- **Delete**: remove chat → removes its threads/messages. Delete thread → removes its messages. (No archive in v1.)
- **Empty/error states**: show clear empty and “Pod not ready / 401” messages; retry stays in place.

## Non-Goals (v1)
- No encryption/ACL customization beyond Pod defaults.
- No multi-modal messages or attachments.
- No multi-user live co-edit; threads are single-user with AI/human contacts as participants.

## Acceptance (doc-first)
- Written spec of data schema (chats/threads/messages + participants, provider/model, starred flags, paths), UI behaviors (left/right/content panes), model-switch + missing-key prompt, and flows for create/chat/thread/search/star/delete. 
