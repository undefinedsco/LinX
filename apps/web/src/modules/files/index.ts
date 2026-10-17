export { FilesTreePane } from './features/tree/FilesTreePane'
export { FilesListPane } from './features/list/FilesListPane'
export { FileDetailPane } from './features/detail/FileDetailPane'
export { useFilesStore } from './app/store'
// R6 K10: LinX's unconfirmed changes to a file (chat shows keep / undo under file messages).
export { AiDraftMessageBar } from './features/card-dialog/AiDraftViews'
// R6-C: LinX's own edits go through the draft layer (plain functions for the chat runtime's tool execution).
export { stageAiDraft } from './data/proposal/ai-draft-commands'
export { writeAiCellChange } from './data/proposal/ai-cell-change-commands'
export { stageAiColumnChange } from './data/proposal/ai-column-change-commands'
// Files LinX created in the chat are written directly (no draft).
export { createRawTextResource, readRawTextResource, saveRawTextResource } from './data/pod-adapter'
