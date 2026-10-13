import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TextMessagePartProps } from '@assistant-ui/react'

/** An assistant answer. Markdown only; links open in a new tab. */
export function MarkdownText({ text }: TextMessagePartProps) {
  if (!text) return null
  return (
    <div className="max-w-[560px] rounded-lg border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_li]:ml-4 [&_ol]:list-decimal [&_p+p]:mt-2 [&_pre]:mt-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_table]:my-2 [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

/** A message from the person: plain text in a quiet bubble. */
export function PlainText({ text }: TextMessagePartProps) {
  if (!text) return null
  return (
    <div className="max-w-full whitespace-pre-wrap break-words rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
      {text}
    </div>
  )
}
