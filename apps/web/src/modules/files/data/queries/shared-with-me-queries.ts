/**
 * What other people shared with me, for the 共享给我 group in the Files tree.
 * The contacts module owns the probing of contacts' spaces.
 */
export { useSharedWithMe } from '@/modules/contacts'
export type SharedWithMeItem = ReturnType<typeof import('@/modules/contacts').useSharedWithMe>['items'][number]
