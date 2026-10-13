import { readLinxSources } from '@linx/agent-runtime/ag-ui'
import { useCardDialog } from '@/lib/card-dialog'
import { useOptionalConversationIdentity } from '../ConversationContext'

/** "依据：维护成本 ›" under an answer (K5): a Pod card opens in the dialog, a web page in a tab. */
export function SourcesLine({ data }: { name: string; data: unknown }) {
  const sources = readLinxSources(data)
  const identity = useOptionalConversationIdentity()
  const open = useCardDialog((state) => state.open)
  if (sources.length === 0) return null
  const podBase = identity?.podBaseUrl?.replace(/\/+$/u, '') ?? null
  return (
    <p className="flex max-w-[440px] flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      <span>依据：</span>
      {sources.map((source) => {
        const inPod = podBase !== null && source.uri.startsWith(podBase)
        return (
          <button
            key={source.uri}
            type="button"
            className="text-primary hover:underline"
            onClick={() => (inPod
              ? open({ uri: source.uri, locator: source.locator, from: 'chat' })
              : window.open(source.uri, '_blank', 'noopener,noreferrer'))}
          >
            {source.title} ›
          </button>
        )
      })}
    </p>
  )
}
