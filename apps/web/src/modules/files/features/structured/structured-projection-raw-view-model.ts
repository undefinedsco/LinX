export type StructuredProjectionRawViewChrome = {
  description: string
  heading: string
}

export function projectStructuredProjectionRawViewChrome(): StructuredProjectionRawViewChrome {
  return {
    description: '当前筛选、predicate 可见性和待确认更改后的投影视图。',
    heading: '当前视图文本',
  }
}
