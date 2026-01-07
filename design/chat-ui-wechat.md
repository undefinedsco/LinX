# Chat UI (WeChat-Inspired) Draft

Goal: Define the layout/states so implementation can start without back-and-forth. Uses our tokens (radius-xs/sm, dark/light themes). Chat history/composer uses ChatKit; generic controls use shadcn.

## Layout
- **Overall App Layout (Three-pane structure)**: The primary application layout consists of three resizable panes, aligned with the `PrimaryLayout` in `apps/web/src/modules/layout/PrimaryLayout.tsx`.
  - **App Navigation (Leftmost)**: A narrow, fixed-width panel for primary application-level navigation (e.g., user profile, global settings, other micro-apps). This panel is distinct from the chat-specific panes.
  - **List Panel (Middle)**: Resizable horizontally. This panel will contain the chat list (WeChat-like vertical list with avatar/logo on the left, title + last message + time on the right). It will have a search bar at the top and a “+” button for new chat creation.
  - **Content Panel (Right)**: Resizable horizontally, filling the remaining space. This panel will display the active chat conversation, including its header, message history, and composer.
- **Internal Chat-specific Layout**:
  - **Content Header**: Chat title, starred icon, provider/model switch (chat-level), and a subtle separator.
  - **Right Sidebar (Role & Threads panel)**: 320px, collapsible. Contains two stacked cards: Role settings card and Threads card with search input and list of threads. Hidden by default on narrow screens; toggle via an icon in the content header.
- **PrimaryLayout integration**: Chat registers its layout config so PrimaryLayout renders: main title/subtitle in the top bar, top-right action cluster (share, right-pane toggle, theme switch, overflow “…”), and the right sidebar content (role + threads). Other micro-apps can omit these fields to keep the default layout.

## List Panel (Chats) - WeChat-like Interaction
- **Item Layout**: 64px row height with a 48px logo/avatar (rounded-sm), right column with title (semibold, single line), last message (sm, muted, ellipsis), timestamp (sm, muted, right-aligned). Starred chats show a small star icon tinted primary.
- **Ordering**: Starred first (recent within), then by lastMessageAt desc.
- **Search**: Live filter on cached list (debounce ~120ms). No extra refetch. Matches title + last message. Search input should be prominently placed at the top of the List Panel.
- **Selection**: Clicking a chat item will load its content in the Content Panel. The selected item must have a clear, brand-aligned active state highlight to indicate the currently active conversation.
- **Actions per item (hover/right-click context menu)**:
    - **Mark as Unread**: Replicates WeChat's ability to mark a read conversation as unread, causing it to appear as new.
    - **Star/Unstar**: Pin/unpin the conversation.
    - **Delete**: Remove the conversation.
    - Other actions may be added as needed (e.g., Pin to Top, Mute Notifications).
- “+” button: Opens a picker to add chat from contacts or group; on create, jump to content pane and spawn first thread.

## Right Pane (Role & Threads)
- Role card: Title “角色设定”, body shows current system prompt (3-line clamp). Action: “编辑” opens modal (textarea + save/cancel).
- Threads card: Search input at top; list items show thread title (auto-named if empty), updatedAt, optional star. Actions: star toggle, rename/auto-name, delete thread (if allowed). List ordered newest → oldest (no separate “新建话题” button here—new threads are started from the composer shortcut).

## Content Panel (ChatKit) - WeChat-like Interaction
- **Header**: Chat title, star toggle, provider logo + model selector (chat-level), button to toggle right pane.
- **History (Message List)**:
  - ChatKit transcript; messages from contacts/AI with name + time; support streaming.
  - **Scrolling Behavior**:
    - New messages automatically scroll the view to the bottom.
    - If the user has scrolled up to view older messages, new incoming messages should not force a scroll to the bottom. Instead, a "New Messages" indicator/button should appear at the bottom of the scroll area, allowing the user to manually jump to the latest message.
    - Smooth scrolling for a better user experience.
  - **Message Bubble Actions (on hover/right-click)**:
    - **Copy**: Copy the message content to the clipboard.
    - **Delete**: Delete the message (with confirmation).
    - **Reply**: Quote the message and start a new reply in the composer.
    - Other context-specific actions (e.g., Forward, Pin Message).
- **Composer (Message Input Area)**:
  - ChatKit composer at bottom.
  - **Appearance**: Borderless text area, matching the clean aesthetic of WeChat.
  - **Toolbar**: Left of send button, include placeholder icons for rich input features:
    - Emoji picker.
    - File attachment.
    - Image/Screenshot.
    - Voice message (if applicable in the future).
  - **Send Button**: Clear send action.
  - **"New Thread" Shortcut**: Left of rich input toolbar (if applicable).
  - **Model Switch**: Right of rich input toolbar (if applicable).
  - **Provider Key Handling**: If current provider missing key, show inline card above composer to add key before sending.
- **Empty State**: If no messages in thread, show prompt with “开始聊天” and optional quick suggestions.

## States & Feedback
- Loading: Skeletons for list and content; spinner overlay on ChatKit during send/fetch.
- Error: Inline alert in content pane when provider/Pod errors; chats list shows toast for delete failures.
- Starred: Unified “starred” flag; starred chats float to top; starred threads float within thread list.

## Styling Tokens
- Radius: use `rounded-sm` for avatars/buttons/cards unless visually grouped; avoid full circles.
- Spacing: list items 12–14 px vertical padding; pane paddings 12–16 px.
- Typography: Title 14–15 semibold; meta 12–13 muted.
- Colors/visuals: reuse the global palette (primary gradient, glass backgrounds, border tokens) so the chat UI matches the rest of the product; no bespoke theme.

## Open Points
- Thread rename UX specifics (inline edit vs modal) — propose inline edit on click of title.
- Group creation flow for “+” — default to contact picker with multi-select and optional chat name.
