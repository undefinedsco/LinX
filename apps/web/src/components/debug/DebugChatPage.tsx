import React from 'react'
import { ChatListPane } from '@/modules/chat/components/ChatListPane'
import { ChatContentPane } from '@/modules/chat/components/ChatContentPane'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

export const DebugChatPage: React.FC = () => {
  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <div className="h-10 bg-muted/50 flex items-center px-4 border-b text-xs text-muted-foreground">
        Debug Chat Page - Isolated View
      </div>
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="min-w-[260px]">
            <ChatListPane theme="light" />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={80}>
            <ChatContentPane theme="light" />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
