import type { ChatInsert } from '../chat.schema'
import type { ContactInsert } from '../contact.schema'
import type { MessageInsert } from '../message.schema'
import type { ThreadInsert } from '../thread.schema'
import type {
  ToolApprovalBlock,
  ToolCallBlock,
  TaskProgressBlock,
} from '../types/collaboration-blocks'
import { ContactClass } from '../contact.schema'

export const fixtureContactSolid: ContactInsert = {
  id: 'contact-solid-1',
  name: 'Alice',
  rdfType: ContactClass.PERSON,
  contactType: 'solid',
  entityUri: 'https://pod.example/profile/card#me',
  isPublic: false,
} satisfies ContactInsert

export const fixtureContactAgentWorkspace: ContactInsert = {
  id: 'contact-agent-ws-1',
  name: 'Secretary@linx',
  rdfType: ContactClass.AGENT,
  contactType: 'agent',
  entityUri: 'https://pod.example/.data/agents/secretary.ttl#this',
  isPublic: false,
} satisfies ContactInsert

export const fixtureChatDirectAI: ChatInsert = {
  id: 'chat-direct-ai-1',
  title: 'Chat Channel',
  participants: [
    'https://pod.example/profile/card#me',
    'https://pod.example/.data/contacts/contact-agent-ws-1.ttl#this',
  ],

  starred: false,
  muted: false,
  unreadCount: 0,
} satisfies ChatInsert

export const fixtureThreadDirectAI: ThreadInsert = {
  id: 'thread-001',
  chatId: 'https://pod.example/.data/chat/chat-direct-ai-1/index.ttl#this',
  title: 'Main thread',
  starred: false,

  workspace: 'https://pod.example/.data/agent-workspaces/secretary/ws-main/',
} satisfies ThreadInsert

export const fixtureToolCallBlock: ToolCallBlock = {
  type: 'tool',
  toolCallId: 'toolcall-1',
  toolName: 'write_file',
  arguments: { path: 'README.md', content: 'hello' },
  status: 'waiting_approval',
  duration: 123,
}

export const fixtureToolApprovalBlock: ToolApprovalBlock = {
  type: 'tool_approval',
  toolCallId: 'toolcall-1',
  toolName: 'write_file',
  toolDescription: 'Write a file in the workspace',
  arguments: { path: 'README.md', content: 'hello' },
  risk: 'medium',
  status: 'pending',
  decisionRole: 'human',
}

export const fixtureTaskProgressBlock: TaskProgressBlock = {
  type: 'task_progress',
  taskId: 'task-1',
  title: 'CP0 contract baseline',
  steps: [
    { id: 's1', label: 'Freeze contracts', status: 'done', duration: 10 },
    { id: 's2', label: 'Add namespaces', status: 'running' },
  ],
  currentStep: 2,
  totalSteps: 2,
}

export const fixtureMessageTooling: MessageInsert = {
  id: 'message-1',
  threadId: 'thread-001',
  chatId: 'https://pod.example/.data/chat/chat-direct-ai-1/index.ttl#this',
  maker: 'https://pod.example/profile/card#me',
  role: 'assistant',
  content: 'I will write a file after approval.',
  richContent: JSON.stringify({
    blocks: [fixtureToolCallBlock, fixtureToolApprovalBlock, fixtureTaskProgressBlock],
  }),
  status: 'sent',
} satisfies MessageInsert
