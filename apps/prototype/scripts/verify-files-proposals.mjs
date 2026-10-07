#!/usr/bin/env node

import assert from 'node:assert/strict'

import {
  approveProposalId,
  appendProposalResourceRecord,
  clearEnumOptionProposal,
  createProposalResourceRecord,
  createPredicateProposal,
  discardProposalId,
  enumOptionProposalUri,
  makePredicateProposalUri,
  proposalKeyForEnumOption,
  proposalKeyForPredicate,
  removeEnumOptionFromValue,
  resolvePredicateProposals,
  setEnumOptionProposal,
  sourceReviewSnapshot,
} from '../src/files/files-proposals.ts'

const result = {
  ok: false,
  checks: [],
  durationMs: 0,
}
const startedAt = Date.now()

function pass(name, details = {}) {
  result.checks.push({ name, ok: true, ...details })
}

function toFailure(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
  }
}

try {
  assert.equal(proposalKeyForPredicate('Workspace', 'dcterms:title'), 'predicate:Workspace:dcterms:title')
  assert.equal(proposalKeyForPredicate('GrantPage', 'dcterms:title'), 'predicate:GrantPage:dcterms:title')
  assert.notEqual(
    proposalKeyForPredicate('Workspace', 'dcterms:title'),
    proposalKeyForPredicate('GrantPage', 'dcterms:title'),
  )
  assert.equal(
    proposalKeyForEnumOption('Class', 'udfs:tags', 'core'),
    'enum-option:Class:udfs:tags:core',
  )
  pass('proposal-keys-are-class-scoped')

  const proposalRecord = createProposalResourceRecord({
    action: 'approve',
    kind: 'predicate',
    scope: 'Workspace',
    target: 'udfs:runtimeStatus',
  })
  assert.deepEqual(proposalRecord, {
    id: 'predicate:Workspace:udfs:runtimeStatus:approve',
    kind: 'predicate',
    action: 'approve',
    target: 'udfs:runtimeStatus',
    scope: 'Workspace',
    uri: '/.data/proposals/predicateWorkspaceUdfsRuntimestatusApprove.ttl',
  })
  assert.deepEqual(appendProposalResourceRecord([], proposalRecord), [proposalRecord])
  assert.deepEqual(appendProposalResourceRecord([proposalRecord], proposalRecord), [proposalRecord])
  pass('proposal-resource-records-are-stable')

  assert.equal(makePredicateProposalUri('GrantPage', 'review status'), '/.vocab/terms.ttl#grantpageReviewStatus')
  const predicate = createPredicateProposal({
    className: 'Workspace',
    description: 'Review status shared by table and Kanban views.',
    index: 1,
    name: 'review status',
    type: 'select',
  })
  assert.deepEqual(predicate, {
    id: 'udfs:workspaceReviewStatus1',
    label: 'udfs:workspaceReviewStatus1',
    uri: '/.vocab/terms.ttl#workspaceReviewStatus',
    type: 'select',
    description: 'Review status shared by table and Kanban views.',
    vocabState: 'ai-pending',
  })
  pass('predicate-proposal-creation-is-stable')

  const approvedKey = proposalKeyForPredicate('Workspace', 'udfs:runtimeStatus')
  const resolved = resolvePredicateProposals([
    {
      id: 'udfs:runtimeStatus',
      label: 'udfs:runtimeStatus',
      uri: '/.vocab/terms.ttl#runtimeStatus',
      type: 'select',
      description: 'Runtime status.',
      vocabState: 'ai-pending',
    },
  ], [approvedKey], 'Workspace')
  assert.equal(resolved[0].vocabState, undefined)
  pass('predicate-approval-resolves-class-scoped-state')

  assert.deepEqual(approveProposalId(['a'], 'a'), ['a'])
  assert.deepEqual(approveProposalId(['a'], 'b'), ['a', 'b'])
  assert.deepEqual(discardProposalId(['a'], 'a'), ['a'])
  assert.deepEqual(discardProposalId(['a'], 'b'), ['a', 'b'])
  pass('approve-discard-id-updates-are-idempotent')

  const enumKey = proposalKeyForEnumOption('Class', 'udfs:tags', 'new-signal')
  const enumState = setEnumOptionProposal({}, enumKey)
  assert.equal(enumState[enumKey], 'ai-pending')
  assert.deepEqual(clearEnumOptionProposal(enumState, enumKey), {})
  assert.equal(removeEnumOptionFromValue('core, new-signal, rdf', 'multi-select', 'new-signal'), 'core, rdf')
  assert.equal(removeEnumOptionFromValue('new-signal', 'select', 'new-signal'), '')
  assert.equal(removeEnumOptionFromValue('core', 'select', 'new-signal'), 'core')
  pass('enum-proposal-cleanup-preserves-cell-semantics')

  assert.equal(
    enumOptionProposalUri(
      {
        id: 'udfs:tags',
        label: 'udfs:tags',
        uri: '/.vocab/terms.ttl#tags',
        type: 'multi-select',
        description: 'Tags.',
      },
      'solid modeling',
      'tags',
    ),
    '/.vocab/terms.ttl#tagsSolidModeling',
  )
  pass('enum-option-uri-generation-is-stable')

  const sourceReview = {
    source: 'https://solidproject.org/TR/protocol',
    ingestStatus: 'lazy chunks',
    readChunks: 38,
    totalChunks: 112,
    changedChunks: 12,
    localProtectedBlocks: 3,
    sourceHash: 'sha256:92d7',
  }
  assert.deepEqual(sourceReviewSnapshot(sourceReview, 'pending'), {
    panelText: '12 new ingest chunks · 3 local edits protected',
    sourceUpdateCount: 12,
    localKeptCount: 0,
    ingestSummary: 'lazy chunks · 38/112 read · 12 changed',
  })
  assert.deepEqual(sourceReviewSnapshot(sourceReview, 'accepted'), {
    panelText: 'Ingest accepted · 12 chunks applied',
    sourceUpdateCount: 0,
    localKeptCount: 0,
    ingestSummary: 'lazy chunks · 38/112 read · 12 changed',
  })
  assert.deepEqual(sourceReviewSnapshot(sourceReview, 'kept'), {
    panelText: 'Local edits kept · 3 protected blocks',
    sourceUpdateCount: 0,
    localKeptCount: 3,
    ingestSummary: 'lazy chunks · 38/112 read · 12 changed',
  })
  pass('source-review-snapshot-is-stable')

  result.ok = true
} catch (error) {
  result.error = toFailure(error)
  process.exitCode = 1
} finally {
  result.durationMs = Date.now() - startedAt
  console.log(JSON.stringify(result))
}
