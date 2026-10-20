import { useEffect, useState, type ReactNode } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { SecretaryWelcome, type SecretaryWelcomeProps } from '../../../ui/SecretaryWelcome'
import { NamingCard } from '../cards/OtherCards'
import { ConversationProvider, useConversationIdentity, useResolveConversationIdentity } from '../ConversationContext'
import { setPendingWelcomeTexts } from './pending-welcome'
import { hasBeenWelcomed, markWelcomed } from './welcome-state'

export const WELCOME_SUGGESTIONS = [
  { id: 'compare', label: '比较几个方案', prompt: '帮我比较几个方案' },
  { id: 'list', label: '整理一份名单', prompt: '帮我整理一份名单' },
  { id: 'weekly', label: '每周提醒我一件事', prompt: '每周提醒我一件事' },
  { id: 'group', label: '拉我进群', prompt: '帮我建一个群，把你拉进来' },
] as const

const ABILITIES: Array<[string, string]> = [
  ['把事做完', '比较方案、整理名单、写文档，做完把文件发给你'],
  ['记住你的做法', '你改过我的结果，可以让我记下来，以后照着做'],
  ['按时帮你', '比如每周一提醒大家排班'],
  ['和朋友一起', '把我拉进群，群里谁都能叫我'],
]

/** The welcome as plain text: what gets saved into the thread once it is over. */
export const WELCOME_INTRO_TEXT = [
  '你好，我是你的助手。我能帮你：',
  ...ABILITIES.map(([title, text]) => `- **${title}**：${text}`),
  '',
  '你的聊天、文件和我记下的东西，都存在你自己的空间里。',
].join('\n')

export function welcomeNamedText(name: string): string {
  return `好，以后我叫${name}。想先做点什么？`
}

function AssistantBubble({ children, name }: { children: React.ReactNode; name: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span aria-hidden="true" title={name} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-primary-foreground">
        AI
      </span>
      <div className="max-w-[72%] space-y-2">{children}</div>
    </div>
  )
}

export function WelcomeSuggestions({ onSuggestion }: { onSuggestion: (suggestion: (typeof WELCOME_SUGGESTIONS)[number]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {WELCOME_SUGGESTIONS.map((suggestion) => (
        <Button key={suggestion.id} size="sm" variant="outline" onClick={() => onSuggestion(suggestion)}>
          {suggestion.label}
        </Button>
      ))}
    </div>
  )
}

/** The assistant's first words: what it can do, a naming card, then a few ways to start. */
export function WelcomeIntro({ name, agentUri, named, onNamed, onSuggestion }: {
  name: string
  agentUri: string | null
  named: string | null
  onNamed: (value: string) => void
  onSuggestion: (suggestion: (typeof WELCOME_SUGGESTIONS)[number]) => void
}) {
  return (
    <>
      <p className="text-center text-xs text-muted-foreground">你的空间已经准备好，{name}也在了</p>
      <AssistantBubble name={name}>
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm leading-relaxed">
          <p>你好，我是你的助手。我能帮你：</p>
          <ul className="mt-1 space-y-0.5">
            {ABILITIES.map(([title, text]) => <li key={title}><strong>{title}</strong>：{text}</li>)}
          </ul>
          <p className="mt-2 text-muted-foreground">你的聊天、文件和我记下的东西，都存在你自己的空间里。</p>
        </div>
      </AssistantBubble>
      <AssistantBubble name={name}>
        {named === null ? (
          <NamingCard uri={agentUri} onNamed={onNamed} />
        ) : (
          <>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">{welcomeNamedText(named)}</div>
            <WelcomeSuggestions onSuggestion={onSuggestion} />
          </>
        )}
      </AssistantBubble>
    </>
  )
}

/**
 * What the conversation shows around an empty thread while the welcome is due.
 * The welcome is first drawn by the UI; as soon as it has something to keep
 * (the person named the assistant, or sent a first message) it is saved into
 * the thread as real assistant messages, so it stays in the timeline and in the
 * chat list preview. `persisted` flips once that is done.
 */
export interface InlineWelcome {
  /** The assistant's first words, before they are saved into the thread. */
  content: (start: (prompt: string) => void) => ReactNode
  /** Ways to start, shown under the saved messages until the first message is sent. */
  suggestions: (start: (prompt: string) => void) => ReactNode
  /** The name the person gave, once they did. */
  named: string | null
  /** The assistant's welcome messages as plain text, oldest first. */
  texts: () => string[]
  persisted: boolean
  onPersisted: () => void
  /** The first message went out: the welcome is over. */
  onStarted: () => void
}

function useWelcomePhase() {
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const [phase, setPhase] = useState<'checking' | 'first' | 'done'>('checking')
  const podBase = db ? resolveCurrentPodBaseUrl(db) : null
  useEffect(() => {
    if (!podBase || !session.fetch) return
    let disposed = false
    hasBeenWelcomed(podBase, session.fetch)
      .then((welcomed) => { if (!disposed) setPhase(welcomed ? 'done' : 'first') })
      .catch(() => { if (!disposed) setPhase('done') })
    return () => { disposed = true }
  }, [podBase, session.fetch])
  const finish = (leave = false) => {
    if (leave) setPhase('done')
    if (podBase && session.fetch) void markWelcomed(podBase, session.fetch).catch(() => undefined)
  }
  return { phase, finish }
}

function InlineWelcomeContent({ named, onNamed, start }: { named: string | null; onNamed: (value: string) => void; start: (prompt: string) => void }) {
  const identity = useConversationIdentity()
  return (
    <WelcomeIntro
      name={named ?? identity.agentName}
      agentUri={identity.agentUri}
      named={named}
      onNamed={onNamed}
      onSuggestion={(suggestion) => start(suggestion.prompt)}
    />
  )
}

/**
 * W0 inside an existing topic: the conversation (with its composer tools, `/` menu and
 * dialogs) is always the real one; while the welcome is due it only adds the assistant's
 * first words above the empty thread. Sending anything ends the welcome.
 */
export function InlineWelcomeHost({ render }: { render: (welcome: InlineWelcome | undefined) => ReactNode }) {
  const { phase, finish } = useWelcomePhase()
  const [named, setNamed] = useState<string | null>(null)
  const [persisted, setPersisted] = useState(false)
  if (phase !== 'first') return <>{render(undefined)}</>
  return (
    <>
      {render({
        content: (start) => (
          <InlineWelcomeContent named={named} onNamed={(value) => { setNamed(value); finish() }} start={start} />
        ),
        suggestions: (start) => <WelcomeSuggestions onSuggestion={(suggestion) => start(suggestion.prompt)} />,
        named,
        texts: () => [WELCOME_INTRO_TEXT, ...(named ? [welcomeNamedText(named)] : [])],
        persisted,
        onPersisted: () => setPersisted(true),
        onStarted: () => finish(true),
      })}
    </>
  )
}

/**
 * W0 before any topic exists: LinX speaks first, with a simple composer that creates
 * the topic. Afterwards (any device) the usual start page shows.
 */
export function WelcomeConversation(props: SecretaryWelcomeProps & { chatId: string }) {
  const { phase, finish } = useWelcomePhase()
  const [named, setNamed] = useState<string | null>(null)
  const identity = useResolveConversationIdentity({ chatId: props.chatId, threadId: '', threadUri: null })

  if (phase === 'checking') {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground" role="status">正在准备…</div>
  }
  if (phase === 'done') return <SecretaryWelcome {...props} />

  const canSend = props.composerValue.trim().length > 0 && !props.isSubmitting
  // Leaving starts the first topic; its surface saves what was said here.
  const leave = () => {
    setPendingWelcomeTexts(props.chatId, [WELCOME_INTRO_TEXT, ...(named ? [welcomeNamedText(named)] : [])])
    finish(true)
  }
  return (
    <ConversationProvider value={identity}>
      <section data-testid="welcome-conversation" className="flex h-full min-h-0 flex-1 flex-col bg-background">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
            <WelcomeIntro
              name={named ?? identity.agentName}
              agentUri={identity.agentUri}
              named={named}
              onNamed={(value) => { setNamed(value); finish() }}
              onSuggestion={(suggestion) => { leave(); props.onStarterAction(suggestion) }}
            />
          </div>
        </div>
        <div className="border-t border-border px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
            <textarea
              aria-label="消息"
              rows={1}
              placeholder="消息"
              value={props.composerValue}
              onChange={(event) => props.onComposerValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && canSend) {
                  event.preventDefault()
                  leave()
                  props.onSubmit()
                }
              }}
              className="min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
            />
            <Button size="sm" disabled={!canSend} onClick={() => { leave(); props.onSubmit() }}>
              <Send className="mr-1 h-3.5 w-3.5" aria-hidden="true" />发送
            </Button>
          </div>
          <p className="mx-auto mt-1 max-w-3xl text-xs text-muted-foreground">{props.composerStatus}</p>
          {props.onRetry ? <Button size="sm" variant="outline" className="mt-2" onClick={props.onRetry}>{props.retryLabel}</Button> : null}
        </div>
      </section>
    </ConversationProvider>
  )
}
