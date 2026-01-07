import { podTable, string, timestamp, text, id, uri } from "drizzle-solid";
import { LINQ, DCTerms, SCHEMA, RDF } from "../namespaces";

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
  targetUri: uri("targetUri").predicate(LINQ.favoriteTarget).notNull(), // 收藏对象的 URI
  
  // 快照信息（用于快速显示，避免每次查询原始资源）
  title: string("title").predicate(DCTerms.title).notNull(),
  snapshotContent: text("snapshotContent").predicate(SCHEMA.text),
  snapshotAuthor: string("snapshotAuthor").predicate(SCHEMA.author),
  
  // 时间戳
  favoredAt: timestamp("favoredAt").predicate(LINQ.favoredAt).notNull().defaultNow(),
}, {
  base: '/.data/favorites/',
  sparqlEndpoint: '/.data/favorites/-/sparql',
  type: SCHEMA.CreativeWork,
  namespace: LINQ,
});

export type FavoriteRow = typeof favoriteTable.$inferSelect;
export type FavoriteInsert = typeof favoriteTable.$inferInsert;
export type FavoriteUpdate = typeof favoriteTable.$inferUpdate;





