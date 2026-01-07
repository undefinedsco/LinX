/**
 * MarkdownRenderer - 独立的 Markdown 渲染器
 * 
 * 参考 Cherry Studio: src/renderer/src/pages/home/Markdown/Markdown.tsx
 * 提供独立的 Markdown 渲染，不依赖 assistant-ui context
 */

import { memo, type FC, type ComponentProps, Suspense, lazy, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { cn } from '@/lib/utils'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

// 懒加载 Mermaid 和代码高亮
const MermaidDiagram = lazy(() => import('@/components/chat-kit/MermaidDiagram'))

export interface MarkdownRendererProps {
  /** Markdown 内容 */
  content: string
  /** 自定义样式 */
  className?: string
  /** 后处理函数（用于引用替换等） */
  postProcess?: (content: string) => string
}

/**
 * 代码块组件
 */
const CodeBlock: FC<{
  language?: string
  code: string
}> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard()

  // Mermaid 图表
  if (language === 'mermaid') {
    return (
      <Suspense
        fallback={
          <div className="my-3 p-4 rounded bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
              <span>加载图表...</span>
            </div>
          </div>
        }
      >
        <MermaidDiagram code={code} />
      </Suspense>
    )
  }

  return (
    <div className="my-2 rounded-md border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/80 px-3 py-1.5 border-b border-border/50">
        <span className="text-xs text-muted-foreground font-mono lowercase">
          {language || 'code'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => copyToClipboard(code)}
        >
          {isCopied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      {/* Code */}
      <pre className="overflow-x-auto bg-muted/50 p-3 font-mono text-sm">
        <code>{code}</code>
      </pre>
    </div>
  )
}

type HTMLElementProps<T extends keyof JSX.IntrinsicElements> = ComponentProps<T>

/**
 * Markdown 渲染器
 * - 支持 GFM
 * - 支持数学公式 (KaTeX)
 * - 支持 Mermaid 图表
 * - 代码高亮和复制
 */
export const MarkdownRenderer = memo<MarkdownRendererProps>(({
  content,
  className,
  postProcess,
}) => {
  // 处理内容
  const processedContent = useMemo(() => {
    if (postProcess) {
      return postProcess(content)
    }
    return content
  }, [content, postProcess])

  return (
    <div className={cn('markdown prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
        // 标题
        h1: ({ className: cls, ...props }: HTMLElementProps<'h1'>) => (
          <h1 className={cn('text-2xl font-bold mt-4 mb-2 first:mt-0', cls)} {...props} />
        ),
        h2: ({ className: cls, ...props }: HTMLElementProps<'h2'>) => (
          <h2 className={cn('text-xl font-semibold mt-3 mb-2 first:mt-0', cls)} {...props} />
        ),
        h3: ({ className: cls, ...props }: HTMLElementProps<'h3'>) => (
          <h3 className={cn('text-lg font-semibold mt-2 mb-1 first:mt-0', cls)} {...props} />
        ),

        // 段落
        p: ({ className: cls, ...props }: HTMLElementProps<'p'>) => (
          <p className={cn('leading-7 [&:not(:first-child)]:mt-2', cls)} {...props} />
        ),

        // 链接
        a: ({ className: cls, ...props }: HTMLElementProps<'a'>) => (
          <a
            className={cn('text-primary underline underline-offset-2 hover:text-primary/80', cls)}
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          />
        ),

        // 列表
        ul: ({ className: cls, ...props }: HTMLElementProps<'ul'>) => (
          <ul className={cn('my-2 ml-4 list-disc [&>li]:mt-1', cls)} {...props} />
        ),
        ol: ({ className: cls, ...props }: HTMLElementProps<'ol'>) => (
          <ol className={cn('my-2 ml-4 list-decimal [&>li]:mt-1', cls)} {...props} />
        ),
        li: ({ className: cls, ...props }: HTMLElementProps<'li'>) => (
          <li className={cn('leading-7', cls)} {...props} />
        ),

        // 引用
        blockquote: ({ className: cls, ...props }: HTMLElementProps<'blockquote'>) => (
          <blockquote
            className={cn('mt-2 border-l-2 border-primary/50 pl-4 italic text-muted-foreground', cls)}
            {...props}
          />
        ),

        // 分隔线
        hr: (props: HTMLElementProps<'hr'>) => <hr className="my-4 border-border" {...props} />,

        // 表格
        table: ({ className: cls, ...props }: HTMLElementProps<'table'>) => (
          <div className="my-4 w-full overflow-auto">
            <table className={cn('w-full border-collapse', cls)} {...props} />
          </div>
        ),
        th: ({ className: cls, ...props }: HTMLElementProps<'th'>) => (
          <th
            className={cn('border border-border px-3 py-2 text-left font-semibold bg-muted/50', cls)}
            {...props}
          />
        ),
        td: ({ className: cls, ...props }: HTMLElementProps<'td'>) => (
          <td className={cn('border border-border px-3 py-2', cls)} {...props} />
        ),

        // 代码 - 区分行内和代码块
        code: ({ className: cls, children, ...props }) => {
          // 检查是否是代码块（父元素是 pre）
          const match = /language-(\w+)/.exec(cls || '')
          const language = match ? match[1] : undefined
          const codeString = String(children).replace(/\n$/, '')

          // 如果有 language 或者包含换行，认为是代码块
          if (language || codeString.includes('\n')) {
            return <CodeBlock language={language} code={codeString} />
          }

          // 行内代码
          return (
            <code
              className={cn('rounded bg-muted px-1.5 py-0.5 font-mono text-sm', cls)}
              {...props}
            >
              {children}
            </code>
          )
        },

        // pre 标签透传
        pre: ({ children }) => <>{children}</>,

        // 强调
        strong: ({ className: cls, ...props }: HTMLElementProps<'strong'>) => (
          <strong className={cn('font-semibold', cls)} {...props} />
        ),
        em: ({ className: cls, ...props }: HTMLElementProps<'em'>) => (
          <em className={cn('italic', cls)} {...props} />
        ),

        // 删除线
        del: ({ className: cls, ...props }: HTMLElementProps<'del'>) => (
          <del className={cn('line-through', cls)} {...props} />
        ),
      }}
    >
      {processedContent}
    </ReactMarkdown>
    </div>
  )
})

MarkdownRenderer.displayName = 'MarkdownRenderer'

export default MarkdownRenderer
