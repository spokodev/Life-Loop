# Transition States and User Feedback

## Why this is critical
Users will judge Life-Loop not only by final outcomes, but by how the product behaves between outcomes. Poor transition design creates anxiety, false confidence, and abandonment.

## Universal transition-state model
Every meaningful flow must define the following states:
- idle
- preparing
- validating
- in-progress
- partial-success
- success
- retrying
- recoverable-error
- blocking-error
- completed-with-warnings
- cancelled
- disconnected-dependency

## Required user guarantees
At every transition point, the UI should answer:
1. What is happening?
2. What already succeeded?
3. What is still pending?
4. What is safe right now?
5. What can the user do next?

## Positive states
Use positive states to reinforce clarity, not just delight.

### Success
Must communicate:
- what just finished
- what changed in the system
- whether any follow-up is needed

### Partial success
Must communicate:
- what succeeded
- what did not
- whether the failure is retryable
- whether the current state is still safe

### Completed with warnings
Must communicate:
- completion was real
- but verification, replication, or another non-blocking step still needs attention

## Negative states
Negative states must not collapse into a generic error.

### Recoverable error
Examples:
- network drop during upload
- temporary API failure
- disconnected replica drive

Must communicate:
- what failed
- what data is already safe
- what will retry automatically vs manually
- what action is available now

### Blocking error
Examples:
- auth failure
- invalid configuration
- missing required storage target
- checksum mismatch blocking completion

Must communicate:
- what is blocked
- what is not yet safe
- exact next operator or user step

## Edge and dependency states
### Disconnected dependency
Examples:
- drive unplugged
- API unavailable
- background worker paused
- staged upload still awaiting archive agent

Must communicate:
- which dependency is unavailable
- whether work is paused or degraded
- whether the user can safely leave and return later

### Empty state
An empty state must teach the next safe action.
It must not feel like a dead end.

### Retry state
If the system is retrying:
- show that retry is happening
- do not simulate success
- keep prior safe results visible
- allow manual retry if appropriate

## Flow-specific guidance

### Upload / ingest
User must always know the difference between:
- selected
- uploading
- received
- staged
- archived
- verified
- safe to remove

### Storage connection
User must always know the difference between:
- detected
- trusted
- configured
- writable
- healthy
- stale
- unavailable

### Cleanup
User must always know:
- what will be removed
- what will remain
- how many verified copies remain
- whether any item is blocked from cleanup

### Restore
User must always know:
- what source will be used
- whether the source is healthy
- where the restore will go
- whether the restore is partial or complete

## Notification policy
Use the lightest feedback mechanism that fits the event:
- inline state changes for local and contextual updates
- toast for short-lived confirmations
- banners for cross-screen important warnings
- dialogs only for irreversible or high-risk decisions

## Satisfaction rule
A user should feel oriented even when something fails. The product wins trust when failure states are calmer, clearer, and more actionable than average software.
