export type KnowledgeFolderScope = "read" | "contribute";

export const knowledgeFolderSchema = {
  folderId: "uuid",
  ownerWebId: "uri",
  storageType: ["solid-pod", "client-local"],
  defaultKnowledgeScope: Boolean
};
