import { podTable, string, timestamp, integer, boolean, id } from "drizzle-solid";
import { LINQ, DCTerms, SCHEMA } from "../namespaces";

/**
 * @deprecated 文件管理应由 xpod 处理，Pod 本身就是文件系统。
 * 标签、索引等元数据功能由 xpod sidecar 提供。
 * 此 schema 将在未来版本中移除。
 * 
 * File Schema
 * 文件管理模型 - 基于 Solid Pod 存储
 * 
 * 参考标准：
 * - Schema.org MediaObject
 * - Schema.org CreativeWork
 * - LDP NonRDFSource (实际文件)
 * 
 * 注意：此表存储文件元数据，实际文件内容存储在 Pod 的文件系统中
 */
export const fileTable = podTable("file", {
  // 基础信息
  id: id("id"),
  name: string("name").predicate(SCHEMA.name).notNull(), // 文件名
  description: string("description").predicate(SCHEMA.description), // 文件描述
  
  // 文件属性
  mimeType: string("mimeType").predicate(SCHEMA.encodingFormat).notNull(), // MIME 类型
  size: integer("size").predicate(SCHEMA.fileSize).notNull(), // 文件大小（字节）
  hash: string("hash").predicate(LINQ.fileHash), // 文件哈希（SHA-256）
  
  // 存储位置
  podUri: string("podUri").predicate(DCTerms.identifier).notNull(), // Pod 中的 URI
  localPath: string("localPath").predicate(LINQ.localPath), // 本地路径（如果已下载）
  
  // 同步状态
  syncStatus: string("syncStatus").predicate(LINQ.syncStatus).notNull().default("synced"), // synced, pending, conflict, error
  lastSyncedAt: timestamp("lastSyncedAt").predicate(DCTerms.modified), // 最后同步时间
  
  // 所有者和权限
  owner: string("owner").predicate(DCTerms.creator).notNull(), // 所有者 WebID
  sharedWith: string("sharedWith").predicate(LINQ.participants), // 共享给的用户 WebID 列表（JSON）
  
  // 分类和标签
  folder: string("folder").predicate(LINQ.conversation), // 所属文件夹 URI
  tags: string("tags").predicate(DCTerms.subject), // 标签（JSON 数组）
  
  // 时间戳
  createdAt: timestamp("createdAt").predicate(DCTerms.created).notNull().defaultNow(),
  modifiedAt: timestamp("modifiedAt").predicate(DCTerms.modified).notNull().defaultNow(),
  deletedAt: timestamp("deletedAt").predicate(LINQ.deletedAt), // 软删除时间
  
  // UI 状态
  starred: boolean("starred").predicate(LINQ.favorite).default(false), // 是否加星标
  pinnedAt: timestamp("pinnedAt").predicate(LINQ.pinnedAt), // 置顶时间
}, {
  base: '/.data/files/', // LDP Container
  sparqlEndpoint: '/.data/files/-/sparql',
  type: SCHEMA.MediaObject,
  namespace: LINQ,
});

export type FileRow = typeof fileTable.$inferSelect;
export type FileInsert = typeof fileTable.$inferInsert;
export type FileUpdate = typeof fileTable.$inferUpdate;





