import type { PodTable } from '@undefineds.co/drizzle-solid'
import type { PodColumnBase } from './columns.js'

export type PodTableWithColumns<TColumns extends Record<string, PodColumnBase<any, any, any, any>>> =
  PodTable<TColumns> & TColumns
