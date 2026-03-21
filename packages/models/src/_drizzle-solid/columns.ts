import type { PodColumn as DrizzlePodColumn } from '@undefineds.co/drizzle-solid'

export type ColumnBuilderDataType =
  | 'string'
  | 'integer'
  | 'boolean'
  | 'datetime'
  | 'json'
  | 'object'
  | 'uri'
  | 'array'

export interface PodColumnOptions {
  primaryKey?: boolean
  notNull?: boolean
  hasDefault?: boolean
  default?: unknown
  predicate?: string
  inverse?: boolean
  isLink?: boolean
  linkTarget?: string
  baseType?: ColumnBuilderDataType
}

export declare class ColumnBuilder<
  TType extends ColumnBuilderDataType,
  TElement extends ColumnBuilderDataType | null = null,
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
> {
  readonly name: string
  readonly dataType: TType
  readonly elementType: TElement
  options: PodColumnOptions

  constructor(name: string, dataType: TType, options?: PodColumnOptions, predicate?: string, elementType?: TElement)

  primaryKey(): ColumnBuilder<TType, TElement, true, THasDefault>
  notNull(): ColumnBuilder<TType, TElement, true, THasDefault>
  predicate(uri: unknown): ColumnBuilder<TType, TElement, TNotNull, THasDefault>
  default(value: unknown): ColumnBuilder<TType, TElement, TNotNull, true>
  defaultNow(): ColumnBuilder<TType, TElement, TNotNull, true>
  inverse(value?: boolean): ColumnBuilder<TType, TElement, TNotNull, THasDefault>
  link(target: string | unknown): ColumnBuilder<TType, TElement, TNotNull, THasDefault>
  array(): ColumnBuilder<'array', TType, TNotNull, THasDefault>
}

export type PodColumnBase<
  TType extends ColumnBuilderDataType = ColumnBuilderDataType,
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
  TElement extends ColumnBuilderDataType | null = null,
> = DrizzlePodColumn<TType, TNotNull, THasDefault, TElement>

export type PodStringColumn<
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
> = DrizzlePodColumn<'string', TNotNull, THasDefault, null>

export type PodIntegerColumn<
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
> = DrizzlePodColumn<'integer', TNotNull, THasDefault, null>

export type PodBooleanColumn<
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
> = DrizzlePodColumn<'boolean', TNotNull, THasDefault, null>

export type PodDateTimeColumn<
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
> = DrizzlePodColumn<'datetime', TNotNull, THasDefault, null>

export type PodJsonColumn<
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
> = DrizzlePodColumn<'json', TNotNull, THasDefault, null>

export type PodObjectColumn<
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
> = DrizzlePodColumn<'object', TNotNull, THasDefault, null>

export type PodUriColumn<
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
> = DrizzlePodColumn<'uri', TNotNull, THasDefault, null>

export type PodArrayColumn<
  TElement extends ColumnBuilderDataType = ColumnBuilderDataType,
  TNotNull extends boolean = false,
  THasDefault extends boolean = false,
> = DrizzlePodColumn<'array', TNotNull, THasDefault, TElement>
