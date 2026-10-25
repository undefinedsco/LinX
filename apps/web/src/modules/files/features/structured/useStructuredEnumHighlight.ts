import { useEffect, useState } from 'react'

/** The option the arrow keys are on in the option cell editor (-1 = none); typing starts over. */
export function useStructuredEnumHighlight(search: string) {
  const [highlighted, setHighlighted] = useState(-1)
  useEffect(() => { setHighlighted(-1) }, [search])
  return [highlighted, setHighlighted] as const
}
