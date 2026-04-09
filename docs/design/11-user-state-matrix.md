# User State Matrix

This document defines the experience requirements for positive, negative, and edge-case transitions. It exists to prevent invisible gaps between backend state and user trust.

## Goal

The user should feel informed, respected, and in control during:
- success
- delay
- failure
- partial success
- dependency loss
- retry
- recovery

## State matrix

| Situation | User should feel | UI must show | Primary action |
|---|---|---|---|
| Upload started | progress is real | active progress + target destination | keep app open only if required |
| Upload delayed | not abandoned | waiting reason + what happens next | retry later or continue in background |
| Upload failed | problem is bounded | what failed, what stayed safe | retry |
| Staging complete | progress is meaningful | staged state, not fake completion | archive now or continue |
| Archive verified | confidence | verified state and copy count | review cleanup eligibility |
| Replica missing | aware but not panicked | warning + what remains safe | connect replica target |
| Partial success | informed | what succeeded vs what did not | continue or review |
| Cleanup available | safe control | exact deletable scope | review and delete safe items |
| Cleanup blocked | clarity | why deletion is blocked | fix blocker |
| Restore started | reassurance | source, target, and progress | monitor restore |
| Restore failed | recoverable seriousness | remaining copies and retry options | retry or inspect details |
| No devices connected | guided | why the screen matters and what to connect | connect device |
| No storage targets configured | motivated, not lost | setup explanation + first action | add storage target |
| Billing limit reached | respected | what is blocked and what remains available | upgrade or adjust usage |

## Non-negotiable UX rules

1. Never imply that "uploaded" means "safe to delete".
2. Never hide partial failure under a generic success message.
3. Never show a celebratory success state if trust-critical work is still pending.
4. Never make the user guess whether originals are safe.
5. Never require reading logs to understand the next human action.

## Transition-state patterns

### Positive transition
Use when:
- the operation completed as intended
- the result is durable enough for the user-facing promise

Must include:
- what succeeded
- whether additional steps remain
- the next best action

### Negative transition
Use when:
- the operation failed fully or materially

Must include:
- what failed
- what remained safe
- what can be retried
- whether user action is required

### Partial-success transition
Use when:
- the operation succeeded in one layer but not the final expected layer

Examples:
- uploaded, but not archived
- archived on one target, not verified on second target
- selected online copy created, but preview generation failed

Must include:
- completed part
- incomplete part
- user impact
- suggested next step

### Dependency-loss transition
Use when:
- disk disconnected
- network unavailable
- server temporarily unavailable
- credentials revoked or expired

Must include:
- what dependency is missing
- what work paused vs failed
- whether retry is automatic or manual

## Delight boundaries

Delight is allowed only when it does not distort the safety model.

Allowed:
- subtle confirmation animation after a truly verified state
- soft motion when a setup step completes
- pleasant step transition in onboarding

Not allowed:
- celebratory motion on upload completion if verification remains
- confetti-like or flashy effects in archive/cleanup/restore flows
- decorative motion that competes with warnings or blocking information

## Copywriting rules for states

Use plain language.

Good:
- Verified on 2 storage targets
- Safe to delete from phone
- Replica missing, archive remains safe on primary target
- Upload failed, nothing was deleted

Avoid:
- Sync complete
- Your data is safe now
- Everything is done
- Operation failed unexpectedly

Without specifics.

## Required implementation tests

Every trust-critical flow should be tested in these states:
- first-load empty
- loading
- slow response
- retry after failure
- dependency removed mid-flow
- partial success
- verified success
- blocked destructive action
- reduced-motion enabled
