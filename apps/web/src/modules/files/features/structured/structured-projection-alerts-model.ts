export type StructuredSourceUnavailableAlertModel = {
  compact: boolean
  message: string
}

export type StructuredShapeWarningsAlertModel = {
  available: boolean
  countLabel: string
  message: string
}

export type StructuredProjectionWarningsAlertModel = {
  available: boolean
  message: string
}

export function projectStructuredSourceUnavailableAlert({
  compact,
}: {
  compact: boolean
}): StructuredSourceUnavailableAlertModel {
  return {
    compact,
    message: compact ? '完整原始内容暂时不可用。' : '完整原始内容暂时不可用，不能解析结构化表。',
  }
}

export function projectStructuredShapeWarningsAlert(
  warnings: readonly { message: string }[],
): StructuredShapeWarningsAlertModel {
  if (warnings.length === 0) {
    return {
      available: false,
      countLabel: '',
      message: '',
    }
  }
  return {
    available: true,
    countLabel: `${warnings.length} 个校验提醒`,
    message: warnings[0]?.message ?? '',
  }
}

export function projectStructuredProjectionWarningsAlert(
  warnings: readonly string[],
): StructuredProjectionWarningsAlertModel {
  if (warnings.length === 0) {
    return {
      available: false,
      message: '',
    }
  }
  return {
    available: true,
    message: warnings[0] ?? '',
  }
}
