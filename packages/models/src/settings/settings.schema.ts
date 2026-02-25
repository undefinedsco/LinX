import { podTable, string, timestamp, text, boolean } from "@undefineds.co/drizzle-solid";
import { UDFS, DCTerms, SCHEMA } from "../namespaces";

/**
 * Settings Schema
 * 用户设置模型 - 基于 Solid Pod 存储
 * 
 * 参考标准：
 * - Schema.org PropertyValue
 * - FOAF preferences
 * 
 * 存储用户的应用配置、偏好设置等
 */
export const settingsTable = podTable("settings", {
  // 设置键值对
  key: string("key").primaryKey().predicate(UDFS.settingKey).notNull(), // 设置键（唯一）
  value: text("value").predicate(UDFS.settingValue).notNull(), // 设置值（JSON 字符串）
  valueType: string("valueType").predicate(UDFS.settingType).notNull().default("string"), // string, number, boolean, json
  
  // 元数据
  category: string("category").predicate(DCTerms.type).notNull(), // 设置分类：ui, ai, sync, privacy, notifications
  label: string("label").predicate(DCTerms.title), // 设置标签（用于 UI 显示）
  description: text("description").predicate(DCTerms.description), // 设置描述
  
  // 所有者
  owner: string("owner").predicate(DCTerms.creator).notNull(), // 设置所有者 WebID
  
  // 是否敏感（敏感设置可能需要加密）
  isSensitive: boolean("isSensitive").predicate(UDFS.status).default(false),
  
  // 时间戳
  createdAt: timestamp("createdAt").predicate(DCTerms.created).notNull().defaultNow(),
  modifiedAt: timestamp("modifiedAt").predicate(DCTerms.modified).notNull().defaultNow(),
}, {
  base: "idp:///settings/", // LDP Container
  sparqlEndpoint: "idp:///settings/-/sparql",
  type: SCHEMA.PropertyValue,
  namespace: UDFS,
});

/**
 * 常用设置键定义
 */
export const SETTING_KEYS = {
  // UI 设置
  UI_THEME: "ui.theme", // dark, light, auto
  UI_LANGUAGE: "ui.language", // zh-CN, en-US
  UI_SIDEBAR_WIDTH: "ui.sidebar.width",
  UI_LIST_PANEL_WIDTH: "ui.listPanel.width",
  
  // AI 设置
  AI_DEFAULT_ASSISTANT: "ai.defaultAssistant", // 默认 AI 助手 URI
  AI_AUTO_REPLY: "ai.autoReply", // 是否自动回复
  AI_STREAMING: "ai.streaming", // 是否启用流式输出
  
  // 同步设置
  SYNC_AUTO: "sync.auto", // 是否自动同步
  SYNC_INTERVAL: "sync.interval", // 同步间隔（秒）
  SYNC_WIFI_ONLY: "sync.wifiOnly", // 仅在 WiFi 下同步
  
  // 隐私设置
  PRIVACY_READ_RECEIPTS: "privacy.readReceipts", // 是否发送已读回执
  PRIVACY_ONLINE_STATUS: "privacy.onlineStatus", // 是否显示在线状态
  PRIVACY_TYPING_INDICATOR: "privacy.typingIndicator", // 是否显示正在输入
  
  // 通知设置
  NOTIFICATIONS_ENABLED: "notifications.enabled",
  NOTIFICATIONS_SOUND: "notifications.sound",
  NOTIFICATIONS_DESKTOP: "notifications.desktop",
  
  // Pod 设置
  POD_AUTO_CONNECT: "pod.autoConnect", // 启动时自动连接
  POD_CACHE_SIZE: "pod.cacheSize", // 缓存大小（MB）
} as const;

export type SettingKey = typeof SETTING_KEYS[keyof typeof SETTING_KEYS];

export type SettingsRow = typeof settingsTable.$inferSelect;
export type SettingsInsert = typeof settingsTable.$inferInsert;
export type SettingsUpdate = typeof settingsTable.$inferUpdate;





