import {
  projectStructuredClassScope,
  type StructuredTableProjection,
} from '../../domain/structured/structured-table'

export function resolveStructuredEffectiveClassScope(
  projection: StructuredTableProjection,
  classScope: string | null,
) {
  return projectStructuredClassScope(projection, classScope).className ?? classScope
}
