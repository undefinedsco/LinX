import type { ApprovalRow, SolidDatabase } from '@undefineds.co/models'
import {
  FILES_ACCESS_APPROVAL_ACTION,
  FILES_ACCESS_APPROVAL_TOOL_NAME,
} from '../../domain/proposal/access-approval-model'
import { approveAccessPolicyProposalFromInbox } from './access-approval-commands'
import {
  FILES_AI_CHANGE_APPROVAL_ACTION,
  FILES_AI_CHANGE_APPROVAL_TOOL_NAME,
} from '../../domain/proposal/ai-change-approval-model'
import { approveAiChangeProposalFromInbox } from './ai-change-approval-commands'
import { markFilesProposalResourceResolved } from './proposal-status-resource'
import {
  FILES_SOURCE_APPROVAL_ACTION,
  FILES_SOURCE_APPROVAL_TOOL_NAME,
} from '../../domain/source/source-approval-model'
import { approveSourceUpdateProposalFromInbox } from './source-approval-commands'
import {
  FILES_STRUCTURED_CELL_APPROVAL_ACTION,
  FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME,
} from '../../domain/proposal/structured-cell-approval-model'
import { approveStructuredCellChangeProposalFromInbox } from './structured-cell-approval-commands'
import {
  FILES_VOCAB_APPROVAL_ACTION,
  FILES_VOCAB_APPROVAL_TOOL_NAME,
} from '../../domain/structured/structured-table'
import { approveVocabTermProposalFromInbox } from './vocab-approval-commands'

type FilesProposalDecision = 'approved' | 'rejected'

function getApprovalTarget(approval: ApprovalRow): string {
  return typeof approval.target === 'string' ? approval.target : ''
}

function shouldApplyVocabProposal(approval: ApprovalRow, decision: FilesProposalDecision): boolean {
  const target = getApprovalTarget(approval)
  return decision === 'approved'
    && target.length > 0
    && approval.action === FILES_VOCAB_APPROVAL_ACTION
    && (
      approval.toolName === FILES_VOCAB_APPROVAL_TOOL_NAME
      || /\/\.data\/proposals\/vocab\/[^#]+\.ttl#proposal$/.test(target)
    )
}

function shouldApplySourceProposal(approval: ApprovalRow, decision: FilesProposalDecision): boolean {
  return decision === 'approved'
    && approval.toolName === FILES_SOURCE_APPROVAL_TOOL_NAME
    && approval.action === FILES_SOURCE_APPROVAL_ACTION
    && getApprovalTarget(approval).length > 0
}

function shouldApplyAccessProposal(approval: ApprovalRow, decision: FilesProposalDecision): boolean {
  return decision === 'approved'
    && approval.toolName === FILES_ACCESS_APPROVAL_TOOL_NAME
    && approval.action === FILES_ACCESS_APPROVAL_ACTION
    && getApprovalTarget(approval).length > 0
}

function shouldApplyAiChangeProposal(approval: ApprovalRow, decision: FilesProposalDecision): boolean {
  return decision === 'approved'
    && approval.toolName === FILES_AI_CHANGE_APPROVAL_TOOL_NAME
    && approval.action === FILES_AI_CHANGE_APPROVAL_ACTION
    && getApprovalTarget(approval).length > 0
}

function shouldApplyStructuredCellProposal(approval: ApprovalRow, decision: FilesProposalDecision): boolean {
  return decision === 'approved'
    && approval.toolName === FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME
    && approval.action === FILES_STRUCTURED_CELL_APPROVAL_ACTION
    && getApprovalTarget(approval).length > 0
}

function isFilesProposalApproval(approval: ApprovalRow): boolean {
  const target = getApprovalTarget(approval)
  if (!target) return false
  const action = typeof approval.action === 'string' ? approval.action : ''
  const matchesKnownFilesAction = (
    (approval.toolName === FILES_VOCAB_APPROVAL_TOOL_NAME && approval.action === FILES_VOCAB_APPROVAL_ACTION)
    || (approval.toolName === FILES_SOURCE_APPROVAL_TOOL_NAME && approval.action === FILES_SOURCE_APPROVAL_ACTION)
    || (approval.toolName === FILES_ACCESS_APPROVAL_TOOL_NAME && approval.action === FILES_ACCESS_APPROVAL_ACTION)
    || (approval.toolName === FILES_AI_CHANGE_APPROVAL_TOOL_NAME && approval.action === FILES_AI_CHANGE_APPROVAL_ACTION)
    || (approval.toolName === FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME && approval.action === FILES_STRUCTURED_CELL_APPROVAL_ACTION)
  )
  if (matchesKnownFilesAction) return true
  if (action && ![
    FILES_VOCAB_APPROVAL_ACTION,
    FILES_SOURCE_APPROVAL_ACTION,
    FILES_ACCESS_APPROVAL_ACTION,
    FILES_AI_CHANGE_APPROVAL_ACTION,
    FILES_STRUCTURED_CELL_APPROVAL_ACTION,
  ].includes(action)) {
    return false
  }
  return /\/\.data\/proposals\/(?:vocab|source|access|ai|cell)\/[^#]+\.ttl#proposal$/.test(target)
}

export const filesProposalApplicationCollection = {
  async applyApprovalDecision(input: {
    db: SolidDatabase
    approval: ApprovalRow
    decision: FilesProposalDecision
  }): Promise<void> {
    const target = getApprovalTarget(input.approval)
    if (!target) return

    if (shouldApplyVocabProposal(input.approval, input.decision)) {
      await approveVocabTermProposalFromInbox(input.db, target)
    }
    if (shouldApplySourceProposal(input.approval, input.decision)) {
      await approveSourceUpdateProposalFromInbox(input.db, target)
    }
    if (shouldApplyAccessProposal(input.approval, input.decision)) {
      await approveAccessPolicyProposalFromInbox(input.db, target)
    }
    if (shouldApplyAiChangeProposal(input.approval, input.decision)) {
      await approveAiChangeProposalFromInbox(input.db, target)
    }
    if (shouldApplyStructuredCellProposal(input.approval, input.decision)) {
      await approveStructuredCellChangeProposalFromInbox(input.db, target)
    }
    if (isFilesProposalApproval(input.approval)) {
      await markFilesProposalResourceResolved(input.db, target, input.decision)
    }
  },
}
