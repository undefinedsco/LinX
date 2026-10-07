import { useState } from 'react'

import {
  type StructuredSubjectPeek,
} from '../../domain/structured/structured-subject-peek'
import {
  projectStructuredSubjectPeekBodyModel,
  projectStructuredSubjectPeekTechnicalDetailsToggle,
} from './structured-subject-peek-body-model'

type StructuredSubjectPeekValue = NonNullable<StructuredSubjectPeek>

export function useStructuredSubjectPeekBodyController(peek: StructuredSubjectPeekValue) {
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false)
  const bodyModel = projectStructuredSubjectPeekBodyModel(peek)

  return {
    ...bodyModel,
    technicalDetailsOpen,
    technicalDetailsToggle: projectStructuredSubjectPeekTechnicalDetailsToggle(technicalDetailsOpen),
    toggleTechnicalDetails: () => setTechnicalDetailsOpen((current) => !current),
  }
}
