import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'

type TestShape = {
  id: string
  type: string
  x?: number
  y?: number
  props?: Record<string, unknown>
}

export class ShapeUtil<TShape = TestShape> {
  static type = 'shape'
  component(_shape: TShape): ReactNode {
    return null
  }
}

export class Rectangle2d {
  constructor(public props: unknown) {}
}

export function HTMLContainer({ children }: { children?: ReactNode }) {
  return <div>{children}</div>
}

export function resizeBox<T>(shape: T) {
  return shape
}

export const T = {
  string: { optional: () => ({}) },
  literalEnum: (...values: string[]) => ({ values }),
  number: {},
  boolean: {},
  optional: (validator: unknown) => validator,
  object: (shape: unknown) => shape,
  arrayOf: (validator: unknown) => validator,
}

export function Tldraw({
  components,
  onMount,
  shapeUtils = [],
}: {
  components?: { InFrontOfTheCanvas?: ComponentType }
  onMount?: (editor: unknown) => void
  shapeUtils?: Array<typeof ShapeUtil>
}) {
  const [shapes, setShapes] = useState<TestShape[]>([])
  const shapesRef = useRef<TestShape[]>([])
  const onMountRef = useRef(onMount)
  const editor = useMemo(() => ({
    createShapes(nextShapes: TestShape[]) {
      shapesRef.current = [...shapesRef.current, ...nextShapes]
      setShapes(shapesRef.current)
    },
    updateShapes(nextShapes: TestShape[]) {
      const patches = new Map(nextShapes.map((shape) => [shape.id, shape]))
      shapesRef.current = shapesRef.current.map((shape) => patches.get(shape.id) ?? shape)
      setShapes(shapesRef.current)
    },
    deleteShapes(ids: string[]) {
      const deleted = new Set(ids)
      shapesRef.current = shapesRef.current.filter((shape) => !deleted.has(shape.id))
      setShapes(shapesRef.current)
    },
    getCurrentPageShapes: () => shapesRef.current,
    resetZoom() {},
    select() {},
    zoomIn() {},
    zoomOut() {},
    zoomToSelection() {},
    store: { listen: () => () => {} },
  }), [])

  useEffect(() => {
    onMountRef.current?.(editor)
  }, [editor])

  const Toolbar = components?.InFrontOfTheCanvas
  return (
    <div data-testid="tldraw-test-double">
      {Toolbar ? <Toolbar /> : null}
      {shapes.map((shape) => {
        const Shape = shapeUtils.find((candidate) => candidate.type === shape.type)
        if (!Shape) return null
        const instance = new Shape()
        return <div key={shape.id}>{instance.component(shape as never)}</div>
      })}
    </div>
  )
}
