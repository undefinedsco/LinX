import {
  HTMLContainer,
  type RecordProps,
  Rectangle2d,
  ShapeUtil,
  T,
  type TLResizeInfo,
  type TLShape,
} from 'tldraw'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import type { LinxGroupRecord } from './linx-whiteboard-adapter'

export const LINX_GROUP_SHAPE_MIN_WIDTH = 320
export const LINX_GROUP_SHAPE_MIN_HEIGHT = 220

export type LinxGroupShapeProps = LinxGroupRecord['props']

declare module '@tldraw/tlschema' {
  export interface TLGlobalShapePropsMap {
    'linx-group': LinxGroupShapeProps
  }
}

export type LinxGroupShape = TLShape<'linx-group'>

export function normalizeLinxGroupShapeSize({ w, h }: { w: number; h: number }) {
  return {
    w: Math.max(LINX_GROUP_SHAPE_MIN_WIDTH, Math.round(w)),
    h: Math.max(LINX_GROUP_SHAPE_MIN_HEIGHT, Math.round(h)),
  }
}

const SECTION_COLORS = ['blue', 'green', 'yellow', 'red', 'purple'] as const

export function TldrawLinxGroupShape({
  shape,
  onUpdate,
}: {
  shape: LinxGroupRecord
  onUpdate?: (props: Partial<LinxGroupShapeProps>) => void
}) {
  const size = normalizeLinxGroupShapeSize(shape.props)
  const [title, setTitle] = useState(shape.props.title)
  useEffect(() => setTitle(shape.props.title), [shape.props.title])
  return (
    <section
      data-testid="linx-whiteboard-section"
      data-whiteboard-section={shape.id}
      data-section-color={shape.props.color}
      className={cn(
        'relative rounded-md border bg-muted/20',
        shape.props.color === 'blue' && 'border-blue-300/70 bg-blue-50/40 dark:bg-blue-950/15',
        shape.props.color === 'green' && 'border-emerald-300/70 bg-emerald-50/40 dark:bg-emerald-950/15',
        shape.props.color === 'yellow' && 'border-amber-300/70 bg-amber-50/40 dark:bg-amber-950/15',
        shape.props.color === 'red' && 'border-rose-300/70 bg-rose-50/40 dark:bg-rose-950/15',
        shape.props.color === 'purple' && 'border-violet-300/70 bg-violet-50/40 dark:bg-violet-950/15',
      )}
      style={{ width: size.w, height: size.h }}
    >
      <input
        aria-label="Section title"
        className="absolute left-2 top-1.5 h-6 max-w-[calc(100%-10rem)] rounded bg-transparent px-1 text-xs font-medium text-foreground/75 outline-none hover:bg-background/70 focus:bg-background"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => onUpdate?.({ title: title.trim() || 'Section' })}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100">
        {SECTION_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Section color ${color}`}
            className={cn(
              'h-4 w-4 rounded-full border border-background shadow-sm',
              color === 'blue' && 'bg-blue-400',
              color === 'green' && 'bg-emerald-400',
              color === 'yellow' && 'bg-amber-400',
              color === 'red' && 'bg-rose-400',
              color === 'purple' && 'bg-violet-400',
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onUpdate?.({ color })}
          />
        ))}
      </div>
    </section>
  )
}

export class LinxGroupShapeUtil extends ShapeUtil<LinxGroupShape> {
  static type = 'linx-group'
  static props: RecordProps<LinxGroupShape> = {
    title: T.string,
    color: T.string,
    w: T.number,
    h: T.number,
  }

  override getDefaultProps(): LinxGroupShape['props'] {
    return { title: 'Section', color: 'blue', w: 640, h: 420 }
  }

  override getGeometry(shape: LinxGroupShape) {
    const size = normalizeLinxGroupShapeSize(shape.props)
    return new Rectangle2d({ width: size.w, height: size.h, isFilled: true })
  }

  override component(shape: LinxGroupShape) {
    return (
      <HTMLContainer>
        <TldrawLinxGroupShape
          shape={shape as LinxGroupRecord}
          onUpdate={(props) => this.editor.updateShape({
            id: shape.id,
            type: shape.type,
            props: { ...shape.props, ...props },
          })}
        />
      </HTMLContainer>
    )
  }

  override onResize(shape: LinxGroupShape, info: TLResizeInfo<LinxGroupShape>) {
    return {
      props: {
        ...shape.props,
        ...normalizeLinxGroupShapeSize({
          w: Math.abs(shape.props.w * info.scaleX),
          h: Math.abs(shape.props.h * info.scaleY),
        }),
      },
    }
  }

  override getIndicatorPath() {
    return undefined
  }
}
