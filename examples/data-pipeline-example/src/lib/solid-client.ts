// 真实的 Solid Pod 客户端
import {
  getSolidDataset,
  saveSolidDatasetAt,
  createSolidDataset,
  createThing,
  setThing,
  addUrl,
  addStringNoLocale,
  addDatetime,
  getThingAll,
  getStringNoLocale,
  getUrl,
  getDatetime,
  removeAll
} from '@inrupt/solid-client'
import { Session } from '@inrupt/solid-client-authn-browser'
import { ChatRow, ChatInsert } from '@/types/chat'

class SolidChatService {
  private session: Session
  private containerUrl: string

  constructor(session: Session, containerUrl: string) {
    this.session = session
    this.containerUrl = containerUrl
  }

  // 获取所有聊天
  async getAllChats(): Promise<ChatRow[]> {
    try {
      const dataset = await getSolidDataset(this.containerUrl, {
        fetch: this.session.fetch
      })
      
      const things = getThingAll(dataset)
      
      return things.map(thing => ({
        id: thing.url,
        title: getStringNoLocale(thing, 'http://purl.org/dc/terms/title') || 'Untitled',
        description: getStringNoLocale(thing, 'http://purl.org/dc/terms/description'),
        conversationType: getStringNoLocale(thing, 'http://linx.app/conversationType') as any || 'direct',
        status: getStringNoLocale(thing, 'http://linx.app/status') as any || 'active',
        participants: getUrl(thing, 'http://linx.app/participants') ? [getUrl(thing, 'http://linx.app/participants')!] : [],
        creator: getStringNoLocale(thing, 'http://purl.org/dc/terms/creator') || '',
        createdAt: getDatetime(thing, 'http://purl.org/dc/terms/created') || new Date(),
        modifiedAt: getDatetime(thing, 'http://purl.org/dc/terms/modified') || new Date(),
        lastMessage: getStringNoLocale(thing, 'http://linx.app/lastMessage'),
        lastMessageAt: getDatetime(thing, 'http://linx.app/lastMessageAt'),
        archivedAt: getDatetime(thing, 'http://linx.app/archivedAt'),
        pinnedAt: getDatetime(thing, 'http://linx.app/pinnedAt'),
      })).filter(chat => chat.title !== 'Untitled') // 过滤掉无效数据
    } catch (error) {
      console.error('获取聊天列表失败:', error)
      return []
    }
  }

  // 创建新聊天
  async createChat(data: ChatInsert): Promise<ChatRow> {
    try {
      // 创建新的 dataset
      let dataset = createSolidDataset()
      
      // 生成唯一的聊天ID
      const chatId = `${this.containerUrl}chat-${Date.now()}`
      
      // 创建聊天 thing
      let chatThing = createThing({ url: chatId })
      chatThing = addStringNoLocale(chatThing, 'http://purl.org/dc/terms/title', data.title)
      
      if (data.description) {
        chatThing = addStringNoLocale(chatThing, 'http://purl.org/dc/terms/description', data.description)
      }
      
      chatThing = addStringNoLocale(chatThing, 'http://linx.app/conversationType', data.conversationType)
      chatThing = addStringNoLocale(chatThing, 'http://linx.app/status', data.status || 'active')
      chatThing = addStringNoLocale(chatThing, 'http://purl.org/dc/terms/creator', data.creator)
      chatThing = addDatetime(chatThing, 'http://purl.org/dc/terms/created', new Date())
      chatThing = addDatetime(chatThing, 'http://purl.org/dc/terms/modified', new Date())
      
      // 添加参与者
      data.participants.forEach(participant => {
        chatThing = addUrl(chatThing, 'http://linx.app/participants', participant)
      })
      
      // 将 thing 添加到 dataset
      dataset = setThing(dataset, chatThing)
      
      // 保存到 Pod
      await saveSolidDatasetAt(chatId, dataset, {
        fetch: this.session.fetch
      })
      
      return {
        id: chatId,
        title: data.title,
        description: data.description || null,
        conversationType: data.conversationType,
        status: data.status || 'active',
        participants: data.participants,
        creator: data.creator,
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastMessage: null,
        lastMessageAt: null,
        archivedAt: null,
        pinnedAt: null,
      }
    } catch (error) {
      console.error('创建聊天失败:', error)
      throw error
    }
  }
}

// 创建全局的 Solid 客户端实例
export function createSolidChatService(session: Session, webId: string): SolidChatService {
  // 从 WebID 构造聊天容器 URL
  const baseUrl = webId.replace('/profile/card#me', '')
  const containerUrl = `${baseUrl}/linx/chats/`
  
  return new SolidChatService(session, containerUrl)
}