// TanStack Query 配置
export const queryConfig = {
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // 5分钟后过期
      gcTime: 10 * 60 * 1000,      // 10分钟后垃圾回收
      retry: 1,                    // 重试1次
      refetchOnWindowFocus: false, // 不在窗口焦点时重新获取
    },
  },
}