import { FOAF, VCARD, LDP, DCTERMS, RDF as RDF_VOCAB, ACL as ACL_VOCAB } from '@inrupt/vocab-common-rdf'

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
export const ACL = ACL_VOCAB

// ODRL isn't provided as a NamespaceConfig-compatible builder in vocab-common-rdf.
// We define a small namespace builder to keep drizzle-solid happy.
export const ODRL = createNamespace('odrl', 'http://www.w3.org/ns/odrl/2/', {
  Policy: 'Policy',
  target: 'target',
  action: 'action',
})

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
  has_parent: 'has_parent',
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
  Announce: 'Announce',
  Public: 'Public',
  audience: 'audience',
  actor: 'actor',
  object: 'object',
})

// Company-level namespace (community-first guidance): all custom terms live under udfs:.
// NOTE: This base URI is part of the contract.
export const UDFS = createNamespace('udfs', 'https://undefineds.co/ns#', {
  // Types
  ApprovalRequest: 'ApprovalRequest',
  AuditEntry: 'AuditEntry',
  AutonomyGrant: 'AutonomyGrant',
  Credential: 'Credential',
  ApiKeyCredential: 'ApiKeyCredential',
  OAuthCredential: 'OAuthCredential',
  Provider: 'Provider',
  Model: 'Model',
  AgentProvider: 'AgentProvider',
  AgentConfig: 'AgentConfig',
  AgentStatus: 'AgentStatus',
  AIConfig: 'AIConfig',
  VectorStore: 'VectorStore',
  IndexedFile: 'IndexedFile',
  Workspace: 'Workspace',
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
  PersonContact: 'PersonContact',
  AgentContact: 'AgentContact',
  GroupContact: 'GroupContact',
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
  metadata: 'metadata',
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
  oauthRefreshToken: 'oauthRefreshToken',
  oauthAccessToken: 'oauthAccessToken',
  oauthExpiresAt: 'oauthExpiresAt',
  baseUrl: 'baseUrl',
  proxyUrl: 'proxyUrl',
  projectId: 'projectId',
  organizationId: 'organizationId',
  service: 'service',
  label: 'label',
  name: 'name',
  displayName: 'displayName',
  description: 'description',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  lastUsedAt: 'lastUsedAt',
  failCount: 'failCount',
  rateLimitResetAt: 'rateLimitResetAt',
  hasModel: 'hasModel',
  hasCredential: 'hasCredential',
  modelType: 'modelType',
  isProvidedBy: 'isProvidedBy',
  dimension: 'dimension',
  contextLength: 'contextLength',
  maxOutputTokens: 'maxOutputTokens',
  embeddingModel: 'embeddingModel',
  previousModel: 'previousModel',
  migrationStatus: 'migrationStatus',
  migrationProgress: 'migrationProgress',
  defaultModel: 'defaultModel',
  runtimeKind: 'runtimeKind',
  executorType: 'executorType',
  maxTurns: 'maxTurns',
  timeout: 'timeout',
  agentId: 'agentId',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  lastActivityAt: 'lastActivityAt',
  currentTaskId: 'currentTaskId',
  errorMessage: 'errorMessage',
  container: 'container',
  chunkingStrategy: 'chunkingStrategy',
  fileUrl: 'fileUrl',
  vectorId: 'vectorId',
  usageBytes: 'usageBytes',
  lastError: 'lastError',
  indexedAt: 'indexedAt',
  inbox: 'inbox',
  session: 'session',
  status: 'status',
  risk: 'risk',
  assignedTo: 'assignedTo',
  reason: 'reason',
  resolvedAt: 'resolvedAt',
  action: 'action',
  actor: 'actor',
  actorRole: 'actorRole',
  context: 'context',
  policy: 'policy',
  approval: 'approval',
  effect: 'effect',
  riskCeiling: 'riskCeiling',
  revokedAt: 'revokedAt',
  archivedAt: 'archivedAt',
  deletedAt: 'deletedAt',
  pinnedAt: 'pinnedAt',
  pinned: 'pinned',
  muted: 'muted',
  mutedAt: 'mutedAt',
  unreadCount: 'unreadCount',
  ttsModel: 'ttsModel',
  videoModel: 'videoModel',
  workspace: 'workspace',
  workspaceType: 'workspaceType',
  workspaceKind: 'workspaceKind',
  rootUri: 'rootUri',
  repoRootUri: 'repoRootUri',
  baseRef: 'baseRef',
  branch: 'branch',
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

  // Favorites V2
  sourceModule: 'sourceModule',
  sourceId: 'sourceId',
  searchText: 'searchText',
  snapshotMeta: 'snapshotMeta',
})

export const UDFS_NAMESPACE = UDFS.NAMESPACE

// Legacy alias: existing code may still import LINQ.
// Keep as alias to avoid churn.
export const LINQ = UDFS

// Wave A contracts: unified under company namespace (UDFS).
// Keep legacy names as aliases to avoid downstream churn.
export const LINX_CHAT = UDFS
export const LINX_MSG = UDFS
