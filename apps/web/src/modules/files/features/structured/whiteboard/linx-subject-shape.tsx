import type { ReactNode } from 'react'
import { Eye, Link2 } from 'lucide-react'
import {
  HTMLContainer,
  type RecordProps,
  Rectangle2d,
  ShapeUtil,
  T,
  type TLResizeInfo,
  type TLShape,
} from 'tldraw'

import { cn } from '@/lib/utils'
import { StructuredSubjectCardContent } from '../../../ui/StructuredSubjectCard'
import type { LinxSubjectShapeProps, LinxSubjectShapeRecord } from './linx-whiteboard-adapter'

export const LINX_SUBJECT_SHAPE_MIN_WIDTH = 240
export const LINX_SUBJECT_SHAPE_MIN_HEIGHT = 120
export const LINX_SUBJECT_SHAPE_MAX_WIDTH = 480
export const LINX_SUBJECT_SHAPE_MAX_HEIGHT = 360

export type TldrawLinxSubjectShapeProps = {
  shape: LinxSubjectShapeRecord
  selected?: boolean
  onOpenSubject?: (subject: string, options?: { navigate?: boolean }) => void
  onConnectSubject?: (from: string, to: string) => void
  children?: ReactNode
}

declare module '@tldraw/tlschema' {
  export interface TLGlobalShapePropsMap {
    'linx-subject': LinxSubjectShapeProps
  }
}

export type LinxSubjectShape = TLShape<'linx-subject'>

export function normalizeLinxSubjectShapeSize({ w, h }: { w: number; h: number }) {
  return {
    w: Math.max(LINX_SUBJECT_SHAPE_MIN_WIDTH, Math.min(LINX_SUBJECT_SHAPE_MAX_WIDTH, Math.round(w))),
    h: Math.max(LINX_SUBJECT_SHAPE_MIN_HEIGHT, Math.min(LINX_SUBJECT_SHAPE_MAX_HEIGHT, Math.round(h))),
  }
}

export function TldrawLinxSubjectShape({
  shape,
  selected = false,
  onOpenSubject,
  onConnectSubject,
  children,
}: TldrawLinxSubjectShapeProps) {
  const size = normalizeLinxSubjectShapeSize(shape.props)
  return (
    <div className="group relative" style={{ width: size.w, height: size.h }}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`打开 subject ${shape.props.title || shape.props.resourceUri}`}
        data-whiteboard-subject={shape.props.resourceUri}
        data-whiteboard-subject-shape={shape.props.resourceUri}
        data-whiteboard-resource-kind={shape.props.resourceKind}
        data-layout-x={Math.round(shape.x)}
        data-layout-y={Math.round(shape.y)}
        data-selected={selected ? 'true' : 'false'}
        className={cn(
          'grid h-full w-full overflow-hidden rounded-md border border-border/50 bg-background p-3 text-xs shadow-sm outline-none',
          selected && 'ring-2 ring-primary/30',
        )}
        onDoubleClick={(event) => {
          event.preventDefault()
          onOpenSubject?.(shape.props.resourceUri, { navigate: true })
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          onOpenSubject?.(shape.props.resourceUri, { navigate: true })
        }}
      >
        <div className="min-w-0">
          <StructuredSubjectCardContent
            model={{
              subject: shape.props.resourceUri,
              title: shape.props.title,
              summary: shape.props.summary,
              classLabel: shape.props.classLabel,
              facts: shape.props.facts,
              pending: shape.props.pending,
            }}
            pendingLabel="待确认"
          />
        </div>
        {children}
      </div>
      {onOpenSubject ? (
        <button
          type="button"
          aria-label={`预览 ${shape.props.title || shape.props.resourceUri}`}
          title="预览"
          className={cn(
            'absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/50 bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-focus-within:opacity-100 group-hover:opacity-100',
            selected && 'opacity-100',
          )}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onOpenSubject(shape.props.resourceUri, { navigate: false })
          }}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
      {onConnectSubject ? (
        <button
          type="button"
          aria-label={`从 ${shape.props.title || shape.props.resourceUri} 创建关系`}
          title="拖到另一张卡片创建关系"
          className={cn(
            'absolute right-1 top-1/2 z-10 inline-flex h-6 w-6 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full border border-border/50 bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-focus-within:opacity-100 group-hover:opacity-100',
            selected && 'opacity-100',
          )}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const complete = (pointerEvent: globalThis.PointerEvent) => {
              cleanup()
              const target = (pointerEvent.target as Element | null)?.closest<HTMLElement>('[data-whiteboard-subject-shape]')
              const targetSubject = target?.dataset.whiteboardSubjectShape
              if (!targetSubject || targetSubject === shape.props.resourceUri) return
              pointerEvent.preventDefault()
              onConnectSubject(shape.props.resourceUri, targetSubject)
            }
            const cancel = () => cleanup()
            const cleanup = () => {
              document.removeEventListener('pointerup', complete, true)
              document.removeEventListener('pointercancel', cancel, true)
            }
            document.addEventListener('pointerup', complete, true)
            document.addEventListener('pointercancel', cancel, true)
          }}
        >
          <Link2 className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

export class LinxSubjectShapeUtil extends ShapeUtil<LinxSubjectShape> {
  static type = 'linx-subject'
  static onOpenSubject: TldrawLinxSubjectShapeProps['onOpenSubject']
  static onConnectSubject: TldrawLinxSubjectShapeProps['onConnectSubject']
  static props: RecordProps<LinxSubjectShape> = {
    resourceUri: T.string,
    resourceKind: T.literalEnum('subject', 'file', 'card', 'group'),
    title: T.string,
    summary: T.string,
    classLabel: T.string.optional(),
    pending: T.boolean,
    facts: T.arrayOf(T.object({ id: T.string, label: T.string })),
    w: T.number,
    h: T.number,
  }

  override getDefaultProps(): LinxSubjectShape['props'] {
    return {
      resourceUri: '',
      resourceKind: 'subject',
      title: '',
      summary: '',
      pending: false,
      facts: [],
      w: 288,
      h: 160,
    }
  }

  override getGeometry(shape: LinxSubjectShape) {
    const size = normalizeLinxSubjectShapeSize(shape.props)
    return new Rectangle2d({
      width: size.w,
      height: size.h,
      isFilled: true,
    })
  }

  override component(shape: LinxSubjectShape) {
    const onOpenSubject = (this.constructor as typeof LinxSubjectShapeUtil).onOpenSubject
    const onConnectSubject = (this.constructor as typeof LinxSubjectShapeUtil).onConnectSubject
    return (
      <HTMLContainer style={{ pointerEvents: 'all' }}>
        <TldrawLinxSubjectShape
          shape={shape}
          onOpenSubject={onOpenSubject}
          onConnectSubject={onConnectSubject}
        />
      </HTMLContainer>
    )
  }

  override onResize(shape: LinxSubjectShape, info: TLResizeInfo<LinxSubjectShape>) {
    const width = Math.abs(shape.props.w * info.scaleX)
    const height = Math.abs(shape.props.h * info.scaleY)
    return {
      props: {
        ...shape.props,
        ...normalizeLinxSubjectShapeSize({ w: width, h: height }),
      },
    }
  }

  override getIndicatorPath() {
    return undefined
  }
}
