// 简单的搜索过滤组件
interface ChatFiltersProps {
  searchQuery: string
  statusFilter: 'all' | 'active' | 'archived'
  typeFilter: 'all' | 'direct' | 'group' | 'ai'
  onSearchChange: (query: string) => void
  onStatusChange: (status: 'all' | 'active' | 'archived') => void
  onTypeChange: (type: 'all' | 'direct' | 'group' | 'ai') => void
  onClear: () => void
  resultCount: number
  totalCount: number
}

export function ChatFilters({
  searchQuery,
  statusFilter,
  typeFilter,
  onSearchChange,
  onStatusChange,
  onTypeChange,
  onClear,
  resultCount,
  totalCount
}: ChatFiltersProps) {
  return (
    <div className="p-4 border-b space-y-3">
      {/* 搜索框 */}
      <input
        type="text"
        placeholder="搜索聊天..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-md"
      />
      
      {/* 过滤器 */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as any)}
          className="px-2 py-1 border rounded text-sm"
        >
          <option value="all">全部状态</option>
          <option value="active">活跃</option>
          <option value="archived">已归档</option>
        </select>
        
        <select
          value={typeFilter}
          onChange={(e) => onTypeChange(e.target.value as any)}
          className="px-2 py-1 border rounded text-sm"
        >
          <option value="all">全部类型</option>
          <option value="direct">私聊</option>
          <option value="group">群聊</option>
          <option value="ai">AI助手</option>
        </select>
        
        <button
          onClick={onClear}
          className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900"
        >
          清除筛选
        </button>
      </div>
      
      {/* 统计 */}
      <div className="text-xs text-gray-500">
        显示 {resultCount} / {totalCount} 个聊天
      </div>
    </div>
  )
}