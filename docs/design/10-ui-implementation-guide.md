# UI Implementation Guide

This document turns the design-system direction into implementation rules for product screens. It exists to reduce drift between high-level design principles and actual UI code.

## Core principle

Life-Loop UI must feel:
- calm
- trustworthy
- premium utility
- clear under stress
- predictable during long-running operations

The interface should never feel theatrical when the user is trying to verify backup safety, storage health, or deletion eligibility.

## UI architecture layers

### Layer 1 — Tokens
Use project-owned tokens for:
- color
- spacing
- radius
- elevation
- motion
- typography

### Layer 2 — Primitives
Use `packages/ui` for reusable primitives:
- Button
- Input
- Select
- Dialog
- Sheet
- Tooltip
- Banner
- Card
- Skeleton
- Progress
- Badge
- EmptyState
- StatusRow
- Stepper

### Layer 3 — Product patterns
Create feature patterns before full screens:
- storage target card
- replica health panel
- ingest progress group
- transition-state banner
- cleanup review table
- restore drill summary
- onboarding step shell

### Layer 4 — Screens
Only after the above layers are stable should feature screens be built.

## Screen categories and required behavior

### 1. Dashboard screens
Must answer immediately:
- what is healthy
- what requires action
- what is in progress
- what is safe
- what is blocked

Rules:
- summary metrics at top
- status groupings before deep details
- no decorative hero sections
- motion only for status changes, not idle decoration

### 2. Onboarding and setup screens
Must reduce uncertainty.

Rules:
- one primary action per step
- one sentence explaining why the step matters
- preserve progress between sessions
- show what happens next
- animate step changes clearly but briefly

### 3. Archive and cleanup screens
These are trust-critical.

Rules:
- always differentiate uploaded vs archived vs verified vs safe to delete
- never use a generic success state where the underlying state is partial
- all destructive actions require clear scope and impact text
- secondary summary must show remaining copies and restore implications

### 4. Error and recovery screens
Must preserve user confidence.

Rules:
- explain what failed
- explain what remains safe
- explain what the user can do now
- never imply loss unless confirmed
- prefer recovery actions over dead-end error modals

## Required state vocabulary

Use consistent labels across the app.

Preferred state terms:
- New
- Uploading
- Uploaded
- Staged
- Archiving
- Archived
- Replicating
- Verified
- Safe to delete from phone
- Needs review
- Blocked
- Retry available
- Restore available

Avoid vague labels such as:
- Done
- Completed
- Synced
- Processed
- Saved

Unless the exact meaning is made explicit in context.

## Layout rules

### Density
- Productivity density, not marketing density
- Tables and lists may be compact
- Destructive and trust-critical dialogs must breathe more

### Width
- Avoid ultra-wide content blocks for configuration forms
- Use constrained content widths for settings, onboarding, and review flows
- Use broader layouts only for monitoring, asset tables, and storage health dashboards

### Hierarchy
Each screen should have:
1. page title
2. one-sentence context or status summary
3. primary action area
4. detailed body
5. secondary/helpful diagnostics lower on the page

## Empty state rules

Every empty state must include:
- what this area is for
- why it is empty right now
- the next useful action
- optional secondary learning link if relevant

Empty states must not feel like failure unless a failure truly happened.

## Loading state rules

Use skeletons for:
- cards
- lists
- summaries
- detail panels

Use progress indicators for:
- uploads
- replication
- restore jobs
- reconnect operations

Use optimistic transitions only when rollback is safe and clearly reversible.

## Error presentation rules

Prefer:
- inline banners for recoverable screen-level problems
- inline field errors for input issues
- toast only for short-lived confirmations or lightweight failures
- modals only when confirmation or high-risk interruption is required

An error state should include, where relevant:
- short title
- plain-language explanation
- safety impact
- next action
- retry availability
- optional diagnostics expansion

## Component-level rules

### Buttons
- one primary action per region
- secondary buttons must remain visually secondary
- destructive buttons require explicit wording

### Badges
Use badges for state labeling, not for long explanations.

### Progress
Progress must distinguish:
- known progress
- indeterminate work
- blocked progress
- partial completion

### Banners
Use banners for stateful, durable information that matters after page refresh.

### Toasts
Use toasts sparingly.
Never communicate a critical safety state only via toast.

## Motion rules inside implementation

- use animation to reinforce causality
- keep enter/exit short and intentional
- avoid chained ornamental animation
- ensure screen remains understandable with reduced motion enabled
- do not animate every card on every refresh

## Performance constraints

- no heavy animation loops in core app screens
- avoid long lists with per-row mount animation by default
- large dashboards must prefer instant layout stability over flourish
- do not use blurred/glass effects as a dependency for visual clarity

## Implementation order for UI code

1. tokens
2. primitives
3. state patterns
4. screen shells
5. screen-specific implementations
6. motion polish

Never start by building pretty full screens with ad-hoc component logic.

## Definition of UI readiness

A screen is not ready until it has:
- normal state
- loading state
- empty state
- error state
- partial-success state if applicable
- reduced-motion behavior
- clear primary action
- clear safety language where relevant
