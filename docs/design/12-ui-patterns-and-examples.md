# UI Patterns and Examples

This document gives implementation-ready patterns for common product states.

## Empty state pattern

Structure:
- icon or lightweight illustration
- title
- one sentence of context
- one primary action
- optional secondary link

Example:
- Title: No storage targets connected
- Context: Add a storage target to start archiving originals outside your phone.
- Primary action: Add storage target
- Secondary action: Learn how storage targets work

## Loading state pattern

Structure:
- preserve layout skeleton
- maintain stable heights
- show immediate activity
- if delay exceeds threshold, explain what the system is waiting for

Example delayed helper text:
- Upload is still running. Large videos can take longer on slower networks.

## Inline warning banner pattern

Structure:
- status icon
- short title
- concise explanation
- one main action
- optional details expansion

Example:
- Title: Replica target unavailable
- Body: Archive verification is complete on the primary target, but the secondary target is offline.
- Action: Reconnect replica target

## Partial-success card pattern

Structure:
- state badge
- summary sentence
- split outcome rows
- next action

Example rows:
- Uploaded to staging: done
- Archived on primary target: done
- Replicated to secondary target: pending
- Safe to delete from phone: no

## Success confirmation pattern

Use only when the product promise has actually been met.

Example:
- Title: Archive verified
- Body: This item is verified on 2 storage targets and is now eligible for phone cleanup.
- Primary action: Review cleanup
- Secondary action: View archive details

## Destructive review pattern

For delete and prune flows, always show:
- item count
- exact scope
- copy count remaining after action
- restore implication
- confirmation wording tied to the real action

Example confirmation label:
- Delete 42 safe items from phone

## Step transition pattern

For onboarding and setup:
- preserve shell layout
- animate content area only
- confirm completed step
- preview next step in short text

## Table pattern for trust-critical lists

Columns should prefer:
- item / asset
- current state
- storage count
- last updated
- blocking issue
- action

Avoid hiding critical state behind hover-only interactions.

## Toast rules

Allowed:
- lightweight confirmation
- short retryable failure with corresponding persistent screen state

Not enough for:
- cleanup eligibility
- storage safety
- archive verification
- restore completion

## Motion do / do not examples

### Do
- fade + slight translate for sheets and dialogs
- subtle scale on card hover in non-critical browsing surfaces
- crossfade skeleton to content
- animate progress fill smoothly

### Do not
- bounce destructive confirmations
- animate warning banners aggressively
- animate entire large tables on refresh
- use motion that obscures the meaning of state changes
