import { BookOpen, ExternalLink } from 'lucide-react'
import type { CitationMessageBlock } from '../message-blocks'
import { safeExternalUrl } from './safe-url'

type SafeWebResult = NonNullable<CitationMessageBlock['webSearch']>['results'][number] & {
  safeUrl: string
}

function hasSafeUrl(result: SafeWebResult | (Omit<SafeWebResult, 'safeUrl'> & { safeUrl: null })): result is SafeWebResult {
  return result.safeUrl !== null
}

export function CitationBlock({ block }: { block: CitationMessageBlock }) {
  const webResults = (block.webSearch?.results ?? [])
    .map((result) => ({ ...result, safeUrl: safeExternalUrl(result.url) }))
    .filter(hasSafeUrl)
  const knowledge = block.knowledge ?? []
  if (webResults.length === 0 && knowledge.length === 0) return null

  return (
    <section className="my-2 max-w-2xl rounded-xl border border-border/60 bg-muted/20 p-3" aria-label="引用来源">
      <header className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
        引用来源
      </header>
      <div className="space-y-2">
        {webResults.map((result, index) => (
          <a
            key={`${result.url}-${index}`}
            href={result.safeUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="block rounded-lg bg-background/70 px-3 py-2 hover:bg-background"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <span className="truncate">{result.title || result.url}</span>
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            </span>
            {result.snippet && <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{result.snippet}</span>}
          </a>
        ))}
        {knowledge.map((item) => (
          <div key={item.id} className="rounded-lg bg-background/70 px-3 py-2">
            <div className="text-sm font-medium text-foreground">{item.title}</div>
            <div className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{item.content}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
