export type StructuredProjectionRawViewChrome = {
  description: string
  heading: string
}

export function projectStructuredProjectionRawViewChrome(): StructuredProjectionRawViewChrome {
  return {
    description: '按当前筛选、显示的列和待确认修改得到的原始数据。',
    heading: '当前视图文本',
  }
}
