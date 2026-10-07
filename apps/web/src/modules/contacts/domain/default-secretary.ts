import { contactResource } from '@undefineds.co/models'

// 与 chat 模块 LINX_DEFAULT_SECRETARY.contactId 同源：同一 buildId 调用、同一 magic key。
// contacts 架构测试禁止 import chat（contacts.architecture.test.ts），故在此重算，不跨模块引用。
export const DEFAULT_SECRETARY_CONTACT_ID = contactResource.buildId({ id: '__secretary__' })

export function isDefaultSecretaryContactId(id: string | null | undefined): boolean {
  return !!id && id === DEFAULT_SECRETARY_CONTACT_ID
}
