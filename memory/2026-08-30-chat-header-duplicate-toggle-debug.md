# Chat header duplicate sidebar toggle

- Symptom: the chat header showed two nearly identical panel icons side by side.
- Root cause: `ChatHeader` and `PrimaryLayout` both rendered controls for the same `toggleRightSidebar` action.
- Fix: keep the shared shell control, remove the Chat-specific duplicate, hide it when no chat is selected, and label the remaining control as “会话详情”.
- Clarity: add non-visual hover titles to the assistant and model controls.
- Evidence: ChatHeader and PrimaryLayout tests pass (23/23); the full Chat suite passes (398/398); TypeScript, Chat lint, and `git diff --check` pass; browser inspection shows no duplicate control.
