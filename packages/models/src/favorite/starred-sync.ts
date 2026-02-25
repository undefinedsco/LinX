/**
 * Starred Sync Hook
 * 
 * 当实体的 starred 字段变更时，自动同步到 favoriteTable：
 * - starred: true → 创建 Favorite 记录
 * - starred: false → 删除 Favorite 记录
 * 
 * 支持的实体类型：Chat, Thread, Contact
 * favoriteType 使用 RDF type URI 标识
 */
import type { HookContext, TableHooks } from '@undefineds.co/drizzle-solid'
import { favoriteTable, type FavoriteInsert } from './favorite.schema'
import { MEETING, SIOC } from '../namespaces'
import { VCARD } from '@inrupt/vocab-common-rdf'

// ============================================================================
// Types
// ============================================================================

/** V2 来源模块类型 */
export type SourceModule = 'chat' | 'contacts' | 'files' | 'messages' | 'thread'

/** 快照数据提取器 */
export interface SnapshotExtractor<T = Record<string, unknown>> {
  /** 获取收藏标题 */
  getTitle: (record: T) => string
  /** 获取内容快照（可选） */
  getContent?: (record: T) => string | undefined
  /** 获取作者快照（可选） */
  getAuthor?: (record: T) => string | undefined
  /** V2: 获取检索文本（可选，默认用 title） */
  getSearchText?: (record: T) => string | undefined
  /** V2: 获取快照元数据 JSON（可选） */
  getSnapshotMeta?: (record: T) => string | undefined
}

/** Starred Sync Hook 配置 */
export interface StarredSyncConfig<T = Record<string, unknown>> {
  /** RDF type URI (e.g., MEETING.LongChat, SIOC.Thread, VCARD.Individual) */
  rdfType: string
  /** V2: 来源模块标识 */
  sourceModule: SourceModule
  /** 快照数据提取器 */
  extractor: SnapshotExtractor<T>
}

// ============================================================================
// Core Sync Logic
// ============================================================================

/**
 * 创建 Favorite 记录
 */
async function createFavorite(
  _ctx: HookContext,
  config: StarredSyncConfig,
  record: Record<string, unknown>
): Promise<void> {
  const { rdfType, sourceModule, extractor } = config
  const targetUri = (record['@id'] as string) || (record.id as string)
  const sourceId = (record.id as string) || targetUri

  if (!targetUri) {
    console.warn('[StarredSync] Cannot create favorite: missing target URI')
    return
  }

  const title = extractor.getTitle(record)
  const favoriteData: FavoriteInsert = {
    id: crypto.randomUUID(),
    targetType: rdfType,
    targetUri,
    title,
    snapshotContent: extractor.getContent?.(record),
    snapshotAuthor: extractor.getAuthor?.(record),
    // V2 fields
    sourceModule,
    sourceId,
    searchText: extractor.getSearchText?.(record) ?? title,
    snapshotMeta: extractor.getSnapshotMeta?.(record),
    favoredAt: new Date(),
    updatedAt: new Date(),
  }

  try {
    const db = getDbInstance()
    if (db) {
      await db.insert(favoriteTable).values(favoriteData).execute()
      console.log(`[StarredSync] Created favorite: ${rdfType} → ${targetUri}`)
    } else {
      console.warn('[StarredSync] No db instance registered')
    }
  } catch (error) {
    console.error('[StarredSync] Failed to create favorite:', error)
  }
}

/**
 * 删除 Favorite 记录（通过 targetUri 查找）
 */
async function deleteFavorite(
  _ctx: HookContext,
  targetUri: string
): Promise<void> {
  if (!targetUri) return

  try {
    const db = getDbInstance()
    if (db) {
      await db.delete(favoriteTable)
        .where({ targetUri } as any)
        .execute()
      console.log(`[StarredSync] Deleted favorite: ${targetUri}`)
    }
  } catch (error) {
    console.error('[StarredSync] Failed to delete favorite:', error)
  }
}

// ============================================================================
// Hook Factory
// ============================================================================

/**
 * 创建 starred 同步 hook
 * 
 * @example
 * const chatTable = podTable('chats', columns, {
 *   hooks: createStarredSyncHook({
 *     rdfType: MEETING.LongChat,
 *     extractor: {
 *       getTitle: (r) => r.title as string,
 *       getContent: (r) => r.lastMessagePreview as string,
 *     }
 *   })
 * })
 */
export function createStarredSyncHook<T = Record<string, unknown>>(
  config: StarredSyncConfig<T>
): TableHooks {
  return {
    afterUpdate: async (ctx, record, changes) => {
      // 只有当 starred 字段发生变化时才处理
      if (!('starred' in changes)) return

      const starred = record.starred as boolean
      const targetUri = (record['@id'] as string) || (record.id as string)

      if (starred) {
        // 标星 → 创建 Favorite
        await createFavorite(ctx, config as StarredSyncConfig, record)
      } else {
        // 取消标星 → 删除 Favorite
        await deleteFavorite(ctx, targetUri)
      }
    },
  }
}

// ============================================================================
// DB Instance Registry
// ============================================================================

let dbInstance: any = null

/**
 * 注册 db 实例（应用层启动时调用）
 */
export function registerDbForStarredSync(db: any): void {
  dbInstance = db
}

/**
 * 获取 db 实例
 */
function getDbInstance(): any {
  return dbInstance
}

// ============================================================================
// Pre-configured Extractors
// ============================================================================

/** Chat 快照提取器 */
export const chatSnapshotExtractor: SnapshotExtractor = {
  getTitle: (r) => (r.title as string) || '未命名对话',
  getContent: (r) => r.lastMessagePreview as string | undefined,
}

/** Thread 快照提取器 */
export const threadSnapshotExtractor: SnapshotExtractor = {
  getTitle: (r) => (r.title as string) || '未命名话题',
}

/** Contact 快照提取器 */
export const contactSnapshotExtractor: SnapshotExtractor = {
  getTitle: (r) => (r.name as string) || (r.alias as string) || '未命名联系人',
  getContent: (r) => r.note as string | undefined,
}

// ============================================================================
// Pre-configured Hooks (using RDF type URIs)
// ============================================================================

/** Chat starred sync hook */
export const chatStarredSyncHook = createStarredSyncHook({
  rdfType: MEETING.LongChat,
  sourceModule: 'chat',
  extractor: chatSnapshotExtractor,
})

/** Thread starred sync hook */
export const threadStarredSyncHook = createStarredSyncHook({
  rdfType: SIOC.Thread,
  sourceModule: 'thread',
  extractor: threadSnapshotExtractor,
})

/** Contact starred sync hook */
export const contactStarredSyncHook = createStarredSyncHook({
  rdfType: VCARD.Individual,
  sourceModule: 'contacts',
  extractor: contactSnapshotExtractor,
})
