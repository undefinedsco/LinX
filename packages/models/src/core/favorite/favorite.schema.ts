import { podTable, string, timestamp, text, id, uri } from "@undefineds.co/drizzle-solid";
import { UDFS, DCTerms, SCHEMA, RDF } from "../namespaces.js";

/**
 * Favorite Schema
 * 收藏项 - 基于 Solid Pod 存储
 * 
 * 支持收藏：Chat, Thread, Contact, Message 等
 * favoriteType 使用 RDF type URI 标识实体类型
 */
export const favoriteTable = podTable("favorite", {
  id: id("id"),
  
  // 收藏目标
  targetType: uri("targetType").predicate(RDF.type).notNull(), // RDF type URI (e.g., MEETING.LongChat)
  targetUri: uri("targetUri").predicate(UDFS.favoriteTarget).notNull(), // 收藏对象的 URI
  
  // 快照信息（用于快速显示，避免每次查询原始资源）
  title: string("title").predicate(DCTerms.title).notNull(),
  snapshotContent: text("snapshotContent").predicate(SCHEMA.text),
  snapshotAuthor: string("snapshotAuthor").predicate(SCHEMA.author),

  // V2: 来源追踪
  sourceModule: string("sourceModule").predicate(UDFS.sourceModule),   // 'chat' | 'contacts' | 'files' | 'messages' | 'thread'
  sourceId: string("sourceId").predicate(UDFS.sourceId),               // 来源对象业务 ID

  // V2: 检索
  searchText: text("searchText").predicate(UDFS.searchText),           // 归一化检索文本

  // V2: 快照元数据
  snapshotMeta: text("snapshotMeta").predicate(UDFS.snapshotMeta),     // JSON: 头像、标签等

  // 时间戳
  favoredAt: timestamp("favoredAt").predicate(UDFS.favoredAt).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").predicate(DCTerms.modified),       // V2: 快照更新时间
}, {
  base: '/.data/favorites/',
  sparqlEndpoint: '/.data/favorites/-/sparql',
  type: SCHEMA.CreativeWork,
  namespace: UDFS,
});

export type FavoriteRow = typeof favoriteTable.$inferSelect;
export type FavoriteInsert = typeof favoriteTable.$inferInsert;
export type FavoriteUpdate = typeof favoriteTable.$inferUpdate;





