// Compatibility entrypoint for vocab approval exports.
// New Files code should import pure proposal models from domain/structured and
// approval side effects from data/proposal/vocab-approval-commands.
export {
  FILES_VOCAB_APPROVAL_ACTION,
  FILES_VOCAB_APPROVAL_POLICY_VERSION,
  FILES_VOCAB_APPROVAL_TOOL_NAME,
  parseVocabTermProposalTurtle,
} from './domain/structured/structured-table'

export {
  approveVocabTermProposalCanonical,
  approveVocabTermProposalFromInbox,
  createVocabTermProposalInboxApproval,
} from './data/proposal/vocab-approval-commands'
