import type { ReactNode } from 'react'
import { Bot, FileText, Folder, MessageCircle, Users, User, WifiOff } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGlobalSearch } from './useGlobalSearch'

function Section({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section aria-label={title} className="py-1">
      <h3 className="px-4 pb-1 pt-2 text-xs text-muted-foreground">{title}</h3>
      <div>{children}</div>
      {footer ? <div className="px-4 pb-1 pt-1 text-xs text-muted-foreground">{footer}</div> : null}
    </section>
  )
}

function Row({ icon, title, subtitle, onClick }: { icon: ReactNode; title: string; subtitle?: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-layout-list-hover focus-visible:bg-layout-list-hover focus-visible:outline-none"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{title}</span>
        {subtitle ? <span className="block truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
    </button>
  )
}

export function GlobalSearchResults({ query }: { query: string }) {
  const search = useGlobalSearch(query)
  const trimmed = query.trim()

  return (
    <ScrollArea className="flex-1">
      <div role="region" aria-label="搜索结果" className="pb-4">
        {!search.isOnline ? (
          <p className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            没有网络，只搜了这台电脑上已有的内容
          </p>
        ) : null}

        {search.chats.length > 0 ? (
          <Section title="会话">
            {search.chats.map((hit) => (
              <Row key={hit.id} icon={<MessageCircle className="h-4 w-4" />} title={hit.title} subtitle={hit.preview} onClick={() => search.openChat(hit.id)} />
            ))}
          </Section>
        ) : null}

        {search.contacts.length > 0 ? (
          <Section title="联系人与群">
            {search.contacts.map((hit) => (
              <Row
                key={hit.id}
                icon={hit.kind === 'group' ? <Users className="h-4 w-4" /> : hit.kind === 'assistant' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                title={hit.name}
                subtitle={hit.kind === 'group' ? '群聊' : hit.kind === 'assistant' ? '助手' : null}
                onClick={() => { void search.openContact(hit) }}
              />
            ))}
          </Section>
        ) : null}

        {(search.isOnline && (search.files.length > 0 || search.fileSearch.isLoading || search.fileSearch.isError)) || search.bodyFiles.length > 0 ? (
          <Section
            title="文件与卡片"
            footer={search.fileSearch.isError ? (
              <span>
                文件这次没搜成功
                <button type="button" className="ml-2 text-primary hover:underline" onClick={search.fileSearch.retry}>重试</button>
              </span>
            ) : (
              <>
                {search.fileSearch.isLoading ? '正在搜文件名…' : search.fileSearch.coverageNote}
                {search.fileSearch.total > search.fileSearch.shown ? (
                  <button type="button" className="ml-2 text-primary hover:underline" onClick={search.viewAllFiles}>
                    查看全部 {search.fileSearch.total} 个
                  </button>
                ) : null}
              </>
            )}
          >
            {search.files.map((entry) => (
              <Row
                key={entry.id}
                icon={entry.kind === 'container' ? <Folder className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                title={entry.name}
                subtitle={entry.kind === 'container' ? '文件夹' : '文件'}
                onClick={() => search.openFile(entry)}
              />
            ))}
            {search.bodyFiles.map((hit) => (
              <Row
                key={`body:${hit.uri}`}
                icon={<FileText className="h-4 w-4" />}
                title={hit.title}
                subtitle={`${hit.snippet}  ·  ${hit.reason}`}
                onClick={() => search.openBodyHit(hit)}
              />
            ))}
          </Section>
        ) : null}

        {search.openError ? <p className="px-4 py-2 text-xs text-destructive">{search.openError}</p> : null}

        {search.isEmpty ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-foreground">没有找到“{trimmed}”</p>
            <p className="mt-1 text-xs text-muted-foreground">搜了会话、联系人、文件名和已建索引的文件正文</p>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  )
}
