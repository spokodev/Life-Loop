export const stateVocabulary = [
  'New',
  'Uploading',
  'Uploaded',
  'Staged',
  'Archiving',
  'Archived',
  'Replicating',
  'Verified',
  'Safe to delete from phone',
  'Needs review',
  'Blocked',
  'Retry available',
  'Restore available',
] as const

export type StateVocabulary = (typeof stateVocabulary)[number]

export const transitionStates = [
  'idle',
  'preparing',
  'validating',
  'in-progress',
  'partial-success',
  'success',
  'retrying',
  'recoverable-error',
  'blocking-error',
  'completed-with-warnings',
  'cancelled',
  'disconnected-dependency',
  'empty',
] as const

export type TransitionState = (typeof transitionStates)[number]

export interface TransitionChecklistState {
  title: string
  description: string
  safeNow: string
  nextAction: string
}
