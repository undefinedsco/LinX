export { favoriteTable, type FavoriteRow, type FavoriteInsert, type FavoriteUpdate } from "./favorite.schema";

// Starred Sync Hook
export {
  createStarredSyncHook,
  registerDbForStarredSync,
  // Pre-configured hooks
  chatStarredSyncHook,
  threadStarredSyncHook,
  contactStarredSyncHook,
  // Extractors (for custom configuration)
  chatSnapshotExtractor,
  threadSnapshotExtractor,
  contactSnapshotExtractor,
  // Types
  type SnapshotExtractor,
  type StarredSyncConfig,
  type SourceModule,
} from "./starred-sync";







