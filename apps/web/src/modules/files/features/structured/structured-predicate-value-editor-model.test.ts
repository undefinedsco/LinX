import { describe, expect, it } from 'vitest'

import {
  createStructuredPredicateValueEditorState,
  planStructuredPredicateBooleanToggle,
  planStructuredPredicateEnumCommit,
  planStructuredPredicateMultiValueAdd,
  planStructuredPredicateMultiValueRemove,
  planStructuredPredicateScalarCommit,
  projectStructuredPredicateValueEditorCommitState,
  projectStructuredPredicateValueEditorChrome,
  projectStructuredPredicateValueEditorDraftPatch,
  projectStructuredPredicateValueEditorModel,
  projectStructuredPredicateValueEditorResetState,
  type StructuredPredicateValueEditorKind,
} from './structured-predicate-value-editor-model'

describe('structured-predicate-value-editor-model', () => {
  it('projects draft and selected values as a single editor state', () => {
    const initial = createStructuredPredicateValueEditorState({
      kind: 'enum',
      values: [' Draft '],
    })

    expect(initial).toEqual({
      draft: 'Draft',
      selectedValues: ['Draft'],
    })

    const patched = projectStructuredPredicateValueEditorDraftPatch({
      current: initial,
      draft: 'Ready',
    })
    expect(patched).toEqual({
      draft: 'Ready',
      selectedValues: ['Draft'],
    })

    const committed = projectStructuredPredicateValueEditorCommitState({
      current: patched,
      plan: planStructuredPredicateEnumCommit({
        kind: 'enum',
        nextValue: ' Ready ',
      }),
    })
    expect(committed).toEqual({
      draft: 'Ready',
      selectedValues: ['Ready'],
    })

    const nooped = projectStructuredPredicateValueEditorCommitState({
      current: committed,
      plan: planStructuredPredicateMultiValueAdd({
        kind: 'multi-select',
        nextValue: '',
        selectedValues: committed.selectedValues,
      }),
    })
    expect(nooped).toEqual({
      draft: '',
      selectedValues: ['Ready'],
    })

    const toggled = projectStructuredPredicateValueEditorCommitState({
      current: nooped,
      plan: planStructuredPredicateBooleanToggle(false),
    })
    expect(toggled).toEqual({
      draft: '',
      selectedValues: ['true'],
    })
  })

  it('normalizes incoming values/options and derives initial editor state', () => {
    expect(projectStructuredPredicateValueEditorResetState({
      kind: 'enum',
      values: ['  Ready  ', '', ' Draft '],
    })).toEqual({
      normalizedValues: ['Ready', 'Draft'],
      draft: 'Ready',
      selectedValues: ['Ready', 'Draft'],
      incomingValuesKey: 'Ready\u0000Draft',
    })

    expect(projectStructuredPredicateValueEditorResetState({
      kind: 'multi-select',
      values: [' Ready '],
    }).draft).toBe('')
  })

  it('projects enum and multi-select view state from draft, selected values, and options', () => {
    const model = projectStructuredPredicateValueEditorModel({
      kind: 'multi-select',
      draft: ' rea ',
      options: ['Ready', 'Ready', 'Review', 'Done'],
      selectedValues: ['Ready'],
    })

    expect(model.normalizedOptions).toEqual(['Ready', 'Review', 'Done'])
    expect(model.multiSelectState).toEqual({
      normalizedDraft: 'rea',
      optionCandidates: [],
      canCreate: true,
      expanded: true,
      showListbox: true,
    })
    expect(model.enumState).toEqual({
      normalizedDraft: 'rea',
      filteredOptions: ['Ready'],
      canCreate: true,
      expanded: true,
      showListbox: true,
    })
    expect(model.scalarInputType).toBe('text')
  })

  it('projects editor chrome, listbox ids, and create-option labels outside the primitive', () => {
    expect(projectStructuredPredicateValueEditorChrome({
      ariaLabel: 'Card tags predicate',
      enumState: {
        canCreate: true,
        normalizedDraft: 'verified',
      },
      multiSelectState: {
        canCreate: true,
        normalizedDraft: 'audited',
      },
      selectedValues: ['source-linked'],
    })).toEqual({
      booleanToggle: {
        ariaLabel: '切换 Card tags predicate',
      },
      enumCreateOption: {
        ariaLabel: '新增值 verified',
        label: '新增 verified*',
      },
      input: {
        placeholder: '选择或创建选项',
      },
      listbox: {
        ariaLabel: 'Card tags predicate 的选项',
        id: 'Card-tags-predicate-options',
      },
      multiSelectCreateOption: {
        ariaLabel: '新增值 audited',
        label: '新增 audited*',
      },
      multiSelectInput: {
        placeholder: '',
      },
      multiSelectSelectedValues: [
        {
          value: 'source-linked',
          ariaLabel: '已选择值 source-linked',
          removeAction: {
            ariaLabel: '移除值 source-linked',
            value: 'source-linked',
          },
        },
      ],
    })

    expect(projectStructuredPredicateValueEditorChrome({
      ariaLabel: 'Card tags predicate',
      enumState: {
        canCreate: false,
        normalizedDraft: 'Ready',
      },
      multiSelectState: {
        canCreate: false,
        normalizedDraft: '',
      },
      placeholder: 'Choose a tag',
      selectedValues: [],
    })).toMatchObject({
      enumCreateOption: null,
      input: {
        placeholder: 'Choose a tag',
      },
      multiSelectCreateOption: null,
      multiSelectInput: {
        placeholder: 'Choose a tag',
      },
      multiSelectSelectedValues: [],
    })
  })

  it('plans serialized commits for enum, scalar, relation, boolean, and multi-select values', () => {
    expect(planStructuredPredicateEnumCommit({
      kind: 'enum',
      nextValue: ' Ready ',
    })).toEqual({
      draft: 'Ready',
      selectedValues: ['Ready'],
      serializedValues: ['"Ready"'],
    })

    expect(planStructuredPredicateScalarCommit({
      kind: 'relation',
      nextValue: 'https://pod.example/cards/report.md',
    })).toEqual({
      draft: 'https://pod.example/cards/report.md',
      selectedValues: ['https://pod.example/cards/report.md'],
      serializedValues: ['<https://pod.example/cards/report.md>'],
    })

    expect(planStructuredPredicateScalarCommit({
      kind: 'date',
      nextValue: '2026-06-30',
    })).toEqual({
      draft: '2026-06-30',
      selectedValues: ['2026-06-30'],
      serializedValues: ['"2026-06-30"^^xsd:date'],
    })

    expect(planStructuredPredicateBooleanToggle(true)).toEqual({
      selectedValues: ['false'],
      serializedValues: ['false'],
    })

    expect(planStructuredPredicateMultiValueAdd({
      kind: 'multi-select',
      nextValue: ' audited ',
      selectedValues: ['source-linked'],
    })).toEqual({
      draft: '',
      selectedValues: ['source-linked', 'audited'],
      serializedValues: ['"source-linked"', '"audited"'],
    })

    expect(planStructuredPredicateMultiValueRemove({
      kind: 'multi-select',
      selectedValues: ['source-linked', 'audited'],
      value: 'source-linked',
    })).toEqual({
      selectedValues: ['audited'],
      serializedValues: ['"audited"'],
    })
  })

  it('plans duplicate and empty multi-select additions as draft-clearing noops', () => {
    const base = {
      kind: 'multi-select' as StructuredPredicateValueEditorKind,
      selectedValues: ['audited'],
    }

    expect(planStructuredPredicateMultiValueAdd({
      ...base,
      nextValue: '',
    })).toEqual({ draft: '', noop: true })

    expect(planStructuredPredicateMultiValueAdd({
      ...base,
      nextValue: 'audited',
    })).toEqual({ draft: '', noop: true })
  })
})
