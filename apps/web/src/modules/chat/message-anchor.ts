function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function collectRoots(host: HTMLElement): ParentNode[] {
  const roots: ParentNode[] = [host]
  if (host.shadowRoot) {
    roots.unshift(host.shadowRoot)
  }
  return roots
}

function findByAttributeScan(root: ParentNode, messageId: string): HTMLElement | null {
  const elements = root instanceof DocumentFragment || root instanceof HTMLElement
    ? Array.from(root.querySelectorAll<HTMLElement>('*'))
    : []

  for (const element of elements) {
    for (const attributeName of element.getAttributeNames()) {
      const value = element.getAttribute(attributeName)
      if (!value) continue
      if (value === messageId || value.endsWith(`#${messageId}`)) {
        return element
      }
    }
  }

  return null
}

export function findChatMessageAnchorElement(host: HTMLElement, messageId: string): HTMLElement | null {
  const escapedId = escapeAttributeValue(messageId)
  const selectors = [
    `[data-message-id="${escapedId}"]`,
    `[data-messageid="${escapedId}"]`,
    `[message-id="${escapedId}"]`,
    `[data-id="${escapedId}"]`,
    `[id="${escapedId}"]`,
  ]

  for (const root of collectRoots(host)) {
    for (const selector of selectors) {
      const match = root.querySelector<HTMLElement>(selector)
      if (match) return match
    }

    const scanned = findByAttributeScan(root, messageId)
    if (scanned) return scanned
  }

  return null
}

export function highlightChatMessageAnchor(target: HTMLElement) {
  const previousScrollMarginTop = target.style.scrollMarginTop
  const previousTransition = target.style.transition
  const previousBoxShadow = target.style.boxShadow
  const previousBackgroundColor = target.style.backgroundColor

  target.style.scrollMarginTop = '96px'
  target.style.transition = 'box-shadow 0.25s ease, background-color 0.25s ease'
  target.style.boxShadow = '0 0 0 2px rgba(124, 77, 255, 0.9)'
  target.style.backgroundColor = 'rgba(124, 77, 255, 0.08)'

  const timeoutId = window.setTimeout(() => {
    target.style.scrollMarginTop = previousScrollMarginTop
    target.style.transition = previousTransition
    target.style.boxShadow = previousBoxShadow
    target.style.backgroundColor = previousBackgroundColor
  }, 1800)

  return () => {
    window.clearTimeout(timeoutId)
    target.style.scrollMarginTop = previousScrollMarginTop
    target.style.transition = previousTransition
    target.style.boxShadow = previousBoxShadow
    target.style.backgroundColor = previousBackgroundColor
  }
}

export function restoreChatMessageAnchor(host: HTMLElement, messageId: string): boolean {
  const target = findChatMessageAnchorElement(host, messageId)
  if (!target) return false

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
  highlightChatMessageAnchor(target)
  return true
}
