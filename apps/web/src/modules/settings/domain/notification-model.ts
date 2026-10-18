/** S7 通用 › 通知: three switches plus "通知里显示内容". */
export interface NotificationPrefs {
  newMessages: boolean
  needsDecision: boolean
  taskFailed: boolean
  showContent: boolean
}

export type NotificationPrefKey = keyof NotificationPrefs

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  newMessages: true,
  needsDecision: true,
  taskFailed: true,
  showContent: true,
}

/** 外观：跟随系统 / 浅色 / 深色。 */
export type AppearancePreference = 'system' | 'light' | 'dark'
