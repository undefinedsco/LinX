/**
 * MermaidDiagram - Mermaid 图表渲染组件
 * 
 * 使用 Mermaid 库渲染流程图、时序图等
 */

import { useEffect, useRef, useState, type FC, memo } from 'react'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'

// 初始化 Mermaid 配置
mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'loose',
  fontFamily: 'inherit',
})

export interface MermaidDiagramProps {
  code: string
  className?: string
}

export const MermaidDiagram: FC<MermaidDiagramProps> = memo(({ code, className }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const renderDiagram = async () => {
      if (!code.trim()) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        
        // 生成唯一 ID
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        
        // 渲染 Mermaid 图表
        const { svg: renderedSvg } = await mermaid.render(id, code.trim())
        setSvg(renderedSvg)
      } catch (err) {
        console.error('Mermaid render error:', err)
        setError(err instanceof Error ? err.message : '图表渲染失败')
      } finally {
        setIsLoading(false)
      }
    }

    renderDiagram()
  }, [code])

  if (isLoading) {
    return (
      <div className={cn('my-3 p-4 rounded bg-muted/30 border border-border/50', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
          <span>正在渲染图表...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('my-3 p-4 rounded bg-destructive/10 border border-destructive/30', className)}>
        <div className="text-sm text-destructive">
          <strong>Mermaid 语法错误:</strong>
          <pre className="mt-2 text-xs whitespace-pre-wrap opacity-80">{error}</pre>
        </div>
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">查看代码</summary>
          <pre className="mt-1 p-2 text-xs bg-muted/50 rounded overflow-x-auto">{code}</pre>
        </details>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'my-3 p-4 rounded bg-card border border-border/50 overflow-x-auto',
        '[&_svg]:max-w-full [&_svg]:h-auto',
        className
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
})

MermaidDiagram.displayName = 'MermaidDiagram'

export default MermaidDiagram
