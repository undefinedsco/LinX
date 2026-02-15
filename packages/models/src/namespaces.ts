import { FOAF, VCARD, LDP, DCTERMS, RDF as RDF_VOCAB } from '@inrupt/vocab-common-rdf'

type NamespaceObject = ((term: string) => string) & {
  prefix: string
  uri: string
  NAMESPACE: string
  term: (name: string) => string
} & Record<string, string>

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/

const createNamespace = (prefix: string, baseUri: string, terms: Record<string, string>): NamespaceObject => {
  const builder = ((term: string) =>
    ABSOLUTE_IRI.test(term) ? term : `${baseUri}${term}`) as NamespaceObject
  builder.prefix = prefix
  builder.uri = baseUri
  builder.NAMESPACE = baseUri
  builder.term = (name: string) => builder(name)
  Object.entries(terms).forEach(([key, local]) => {
    Object.defineProperty(builder, key, {
      value: builder(local),
      enumerable: true,
    })
  })
  return builder
}

export { FOAF, VCARD, LDP }
export const DCTerms = DCTERMS
export const RDF = RDF_VOCAB

export const RDFS = createNamespace('rdfs', 'http://www.w3.org/2000/01/rdf-schema#', {
  Class: 'Class',
  label: 'label',
  comment: 'comment',
  subClassOf: 'subClassOf',
  domain: 'domain',
  range: 'range',
})

export const OWL = createNamespace('owl', 'http://www.w3.org/2002/07/owl#', {
  Ontology: 'Ontology',
  Class: 'Class',
  ObjectProperty: 'ObjectProperty',
  DatatypeProperty: 'DatatypeProperty',
})

export const SCHEMA = createNamespace('schema', 'http://schema.org/', {
  CreativeWork: 'CreativeWork',
  MediaObject: 'MediaObject',
  PropertyValue: 'PropertyValue',
  author: 'author',
  dateCreated: 'dateCreated',
  dateDeleted: 'dateDeleted',
  description: 'description',
  encodingFormat: 'encodingFormat',
  fileSize: 'fileSize',
  image: 'image',
  name: 'name',
  participant: 'participant',
  text: 'text',
  url: 'url',
})

export const SIOC = createNamespace('sioc', 'http://rdfs.org/sioc/ns#', {
  Post: 'Post',
  Thread: 'Thread',
  Forum: 'Forum',
  content: 'content',
  richContent: 'richContent',
  hasReply: 'has_reply',
  replyOf: 'reply_of',
  hasCreator: 'has_creator',
  createdAt: 'created_at',
  hasContainer: 'has_container',
  numReplies: 'num_replies',
  has_member: 'has_member',
})

export const MEETING = createNamespace('mee', 'http://www.w3.org/ns/pim/meeting#', {
  LongChat: 'LongChat',
  Message: 'Message',
})

export const WF = createNamespace('wf', 'http://www.w3.org/2005/01/wf/flow-1.0#', {
  message: 'message',
  participation: 'participation',
  participant: 'participant',
})

// Activity Streams 2.0 - W3C standard for social web
export const AS = createNamespace('as', 'https://www.w3.org/ns/activitystreams#', {
  Public: 'Public',
  audience: 'audience',
  actor: 'actor',
  object: 'object',
})

// Company-level namespace (community-first guidance): all custom terms live under udfs:.
// NOTE: This base URI is part of the contract.
export const UDFS = createNamespace('udfs', 'https://undefineds.co/ns#', {
  favorite: 'favorite',
  favoriteType: 'favoriteType',
  favoriteTarget: 'favoriteTarget',
  favoredAt: 'favoredAt',
  conversation: 'conversation',
  conversationType: 'conversationType',
  conversationTitle: 'conversationTitle',
  lastMessage: 'lastMessage',
  lastActiveAt: 'lastActiveAt',
  lastSyncedAt: 'lastSyncedAt',
  sortKey: 'sortKey',
  hasThread: 'hasThread',
  inThread: 'inThread',
  participants: 'participants',
  messageContent: 'messageContent',
  messageType: 'messageType',
  messageStatus: 'messageStatus',
  readBy: 'readBy',
  Contact: 'Contact',
  hasContact: 'hasContact',
  contactType: 'contactType',
  entityUri: 'entityUri',
  externalPlatform: 'externalPlatform',
  externalId: 'externalId',
  alias: 'alias',
  aiAssistant: 'aiAssistant',
  aiModel: 'aiModel',
  aiModels: 'aiModels',
  aiProvider: 'aiProvider',
  credential: 'credential',
  systemPrompt: 'systemPrompt',
  temperature: 'temperature',
  maxTokens: 'maxTokens',
  systemMessage: 'systemMessage',
  provider: 'provider',
  model: 'model',
  ModelProvider: 'ModelProvider',
  tools: 'tools',
  contextWindow: 'contextWindow',
  contextRound: 'contextRound',
  Agent: 'Agent',
  agentCapability: 'agentCapability',
  agentTool: 'agentTool',
  agentConfig: 'agentConfig',
  fileHash: 'fileHash',
  syncStatus: 'syncStatus',
  localPath: 'localPath',
  isDefault: 'isDefault',
  settingKey: 'settingKey',
  settingValue: 'settingValue',
  settingType: 'settingType',
  apiKey: 'apiKey',
  baseUrl: 'baseUrl',
  inbox: 'inbox',
  status: 'status',
  archivedAt: 'archivedAt',
  deletedAt: 'deletedAt',
  pinnedAt: 'pinnedAt',
  pinned: 'pinned',
  muted: 'muted',
  mutedAt: 'mutedAt',
  unreadCount: 'unreadCount',
  ttsModel: 'ttsModel',
  videoModel: 'videoModel',
  chatType: 'chatType',
  workspace: 'workspace',
  policyRef: 'policyRef',
  policyVersion: 'policyVersion',
  parentThreadId: 'parentThreadId',
  sessionStatus: 'sessionStatus',
  sessionTool: 'sessionTool',
  tokenUsage: 'tokenUsage',
  groupOwner: 'groupOwner',
  groupAdmin: 'groupAdmin',
  senderName: 'senderName',
  senderAvatarUrl: 'senderAvatarUrl',
  mentions: 'mentions',
  replyTo: 'replyTo',
  routedBy: 'routedBy',
  routeTargetAgentId: 'routeTargetAgentId',
  coordinationId: 'coordinationId',
  toolCallId: 'toolCallId',
  toolName: 'toolName',
  toolArguments: 'toolArguments',
  toolStatus: 'toolStatus',
  toolResult: 'toolResult',
  toolError: 'toolError',
  toolDuration: 'toolDuration',
  toolRisk: 'toolRisk',
  approvalStatus: 'approvalStatus',
  decisionBy: 'decisionBy',
  decisionRole: 'decisionRole',
  onBehalfOf: 'onBehalfOf',
  approvalReason: 'approvalReason',
  inboxItemId: 'inboxItemId',
  taskProgressId: 'taskProgressId',
  taskSteps: 'taskSteps',
  currentStep: 'currentStep',
  totalSteps: 'totalSteps',
})

export const UDFS_NAMESPACE = UDFS.NAMESPACE

// Legacy alias: existing code may still import LINQ.
// Keep as alias to avoid churn.
export const LINQ = UDFS

// Wave A contracts: unified under company namespace (UDFS).
// Keep legacy names as aliases to avoid downstream churn.
export const LINX_CHAT = UDFS
export const LINX_MSG = UDFS
