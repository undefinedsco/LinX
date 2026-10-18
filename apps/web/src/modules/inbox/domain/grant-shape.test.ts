import { describe, expect, it } from 'vitest'
import { ODRL } from '@undefineds.co/models'
import { isDelegatedFileEdit } from '@/modules/chat/services/chatkit-local/pod-file-tools'
import {
  grantShapeForApproval,
  isFileEditApproval,
  proposalResourceOfApproval,
  readProposalFileTarget,
} from './grant-shape'

const POD = 'https://pod.example/'
const PROPOSAL = `${POD}.data/proposals/ai/plan-1a2b.ttl#proposal`

describe('grant shape for file-edit approvals', () => {
  it('recognises file-edit approvals by tool name or proposal action', () => {
    expect(isFileEditApproval({ toolName: 'files_edit', action: ODRL.term('use') })).toBe(true)
    expect(isFileEditApproval({ toolName: 'files.ai.change.proposal' })).toBe(true)
    expect(isFileEditApproval({ action: 'https://undefineds.co/vocab/reviewAiChangeProposal' })).toBe(true)
    expect(isFileEditApproval({ toolName: 'shell', action: ODRL.term('use') })).toBe(false)
    expect(isFileEditApproval({ toolName: 'files.access.proposal', action: 'https://undefineds.co/vocab/reviewAccessPolicyProposal' })).toBe(false)
  })

  it('turns a file-edit approval into a modify grant on the edited file', () => {
    const approval = { toolName: 'files_edit', action: ODRL.term('use'), target: `${POD}data/chats/c1/` }
    expect(grantShapeForApproval(approval, `${POD}docs/plan.md`)).toEqual({
      action: ODRL.term('modify'),
      target: `${POD}docs/plan.md`,
    })
  })

  it('keeps the approval target when the edited file is unknown, and leaves other approvals alone', () => {
    const edit = { toolName: 'files.ai.change.proposal', action: 'x', target: PROPOSAL }
    expect(grantShapeForApproval(edit)).toEqual({ action: ODRL.term('modify'), target: PROPOSAL })
    const other = { toolName: 'shell', action: ODRL.term('use'), target: `${POD}t/` }
    expect(grantShapeForApproval(other, `${POD}docs/plan.md`)).toEqual({ action: ODRL.term('use'), target: `${POD}t/` })
  })

  it('finds the file a stored proposal is about', () => {
    expect(proposalResourceOfApproval({ target: PROPOSAL })).toBe(`${POD}.data/proposals/ai/plan-1a2b.ttl`)
    expect(proposalResourceOfApproval({ target: `${POD}data/chats/c1/` })).toBeNull()
    expect(readProposalFileTarget(`<#proposal> a udfs:AiChangeProposal ;\n  udfs:targetResource <${POD}docs/plan.md> ;\n  udfs:status "pending" .`)).toBe(`${POD}docs/plan.md`)
    expect(readProposalFileTarget(`<#proposal> udfs:sourceDocument <${POD}tables/t.ttl> .`)).toBe(`${POD}tables/t.ttl`)
    expect(readProposalFileTarget('<#proposal> a udfs:Other .')).toBeNull()
  })

  it('makes a later LinX edit of that file keep directly (the R6-C delegation check)', () => {
    const approval = { toolName: 'files_edit', action: ODRL.term('use'), target: `${POD}data/chats/c1/` }
    const shape = grantShapeForApproval(approval, `${POD}docs/plan.md`)
    const grant = { id: 'g1', ...shape, riskCeiling: null }
    expect(isDelegatedFileEdit([grant], `${POD}docs/plan.md`, POD)).toBe(true)
    expect(isDelegatedFileEdit([grant], `${POD}docs/other.md`, POD)).toBe(false)
    // The unmapped approval (old behaviour) would never cover the file.
    const unmapped = { id: 'g2', action: approval.action, target: approval.target, riskCeiling: null }
    expect(isDelegatedFileEdit([unmapped], `${POD}docs/plan.md`, POD)).toBe(false)
  })
})
