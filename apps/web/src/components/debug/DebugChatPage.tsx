import React, { Suspense, lazy } from 'react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

const ChatListPane = lazy(() =>
  import('@/modules/chat/components/ChatListPane').then((mod) => ({ default: mod.ChatListPane })),
)
const ChatContentPane = lazy(() =>
  import('@/modules/chat/components/ChatContentPane').then((mod) => ({ default: mod.ChatContentPane })),
)

export const DebugChatPage: React.FC = () => {
  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <div className="h-10 bg-muted/50 flex items-center px-4 border-b text-xs text-muted-foreground">
        Debug Chat Page - Isolated View
      </div>
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="min-w-[260px]">
            <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/10" />}>
              <ChatListPane theme="light" />
            </Suspense>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={80}>
            <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/10" />}>
              <ChatContentPane theme="light" />
            </Suspense>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
