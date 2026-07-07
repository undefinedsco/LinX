import type { StructuredSubjectPeek } from '../../domain/structured/structured-subject-peek'
import { ResourceSidecarActions } from '../sidecars/ResourceSidecars'
import { projectStructuredSubjectPeekActions } from './structured-subject-peek-actions-model'

export function StructuredSubjectPeekActions({
  peek,
  targetIsCurrentFile = false,
  onClose,
  onCopyExternalIri,
  onOpenSource,
  onOpenSubjectResource,
}: {
  peek: StructuredSubjectPeek
  targetIsCurrentFile?: boolean
  onClose: () => void
  onCopyExternalIri?: () => void
  onOpenSource?: () => void
  onOpenSubjectResource: () => void
}) {
  const actions = projectStructuredSubjectPeekActions({ peek, targetIsCurrentFile })

  return (
    <>
      {actions.map((action) => {
        if (action.kind === 'resource-sidecar') {
          return peek ? (
            <ResourceSidecarActions
              key={action.kind}
              file={{ uri: peek.targetUri, kind: 'resource', semanticKind: 'file' }}
              showMeta={false}
              compact
            />
          ) : null
        }

        const onClick =
          action.kind === 'copy-external'
            ? onCopyExternalIri
            : action.kind === 'open-source'
              ? onOpenSource
              : action.kind === 'primary-open'
                ? onOpenSubjectResource
                : onClose

        if (!onClick) return null
        return (
          <button
            key={action.kind}
            type="button"
            className={action.className}
            onClick={onClick}
          >
            {action.label}
          </button>
        )
      })}
    </>
  )
}
