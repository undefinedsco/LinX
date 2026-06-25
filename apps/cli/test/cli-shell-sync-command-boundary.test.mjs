import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const commandSource = readFileSync(new URL('../src/lib/linx-pi-cli-command.ts', import.meta.url), 'utf8')

const syncAdmissionSource = readFileSync(new URL('../src/lib/linx-pod-mirror-sync-cli-admission.ts', import.meta.url), 'utf8')

const syncRecoverySource = readFileSync(new URL('../src/lib/linx-pod-mirror-sync-recovery.ts', import.meta.url), 'utf8')

test('default Pi/TUI command module delegates Pod mirror sync recovery commands', () => {
  assert.doesNotMatch(commandSource, /listPendingLinxPodMirrorSync/, 'command orchestration should not list Pod mirror sync checkpoints directly')
  assert.doesNotMatch(commandSource, /retryPendingLinxPodMirrorSync/, 'command orchestration should not replay Pod mirror sync checkpoints directly')
  assert.doesNotMatch(commandSource, /runPiSyncStatusCommand/, 'sync recovery command implementation should live in its own shell command module')
  assert.doesNotMatch(commandSource, /runPiSyncRetryCommand/, 'sync recovery retry implementation should live in its own shell command module')
})

test('Pod mirror sync recovery exposes LinX-named recovery helpers', () => {
  assert.match(syncRecoverySource, /\bLinxPodMirrorSyncStatus\b/)
  assert.match(syncRecoverySource, /\bLinxPodMirrorSyncRetryResult\b/)
  assert.match(syncRecoverySource, /\bgetLinxPodMirrorSyncDir\b/)
  assert.match(syncRecoverySource, /\blistPendingLinxPodMirrorSync\b/)
  assert.match(syncRecoverySource, /\bretryPendingLinxPodMirrorSync\b/)
  assert.doesNotMatch(syncRecoverySource, /\bPiPodMirrorSyncStatus\b/)
  assert.doesNotMatch(syncRecoverySource, /\bPiPodMirrorSyncRetryResult\b/)
  assert.doesNotMatch(syncRecoverySource, /\bgetPiPodMirrorSyncDir\b/)
  assert.doesNotMatch(syncRecoverySource, /\blistPendingPiPodMirrorSync\b/)
  assert.doesNotMatch(syncRecoverySource, /\bretryPendingPiPodMirrorSync\b/)
})

test('default Pi/TUI command module delegates hidden Pod mirror sync flag admission', () => {
  assert.match(commandSource, /from ['"]\.\/linx-pod-mirror-sync-cli-admission\.js['"]/, 'command orchestration should delegate hidden sync flag admission to its own module')
  assert.doesNotMatch(commandSource, /argv\[['"]pi-sync-status['"]\]/, 'command orchestration should not branch on hidden sync status flags directly')
  assert.doesNotMatch(commandSource, /argv\[['"]pi-sync-retry['"]\]/, 'command orchestration should not branch on hidden sync retry flags directly')
  assert.match(syncAdmissionSource, /runLinxPodMirrorSyncStatusCommand/, 'sync admission module should call the sync status command')
  assert.match(syncAdmissionSource, /runLinxPodMirrorSyncRetryCommand/, 'sync admission module should call the sync retry command')
})
