# Design Tokens

## Principles
Tokens must express semantics, not random hex values. Tokens are part of the product contract: they must support trust, clarity, and consistent interaction across calm states, critical states, and recovery states.

## Foundation token groups
- color
- spacing
- radius
- typography
- elevation
- motion
- icon size
- z-index
- opacity
- blur
- layout density

## Semantic color categories
- surface
- surface-muted
- surface-raised
- surface-critical
- text-primary
- text-secondary
- text-muted
- border
- border-strong
- primary
- success
- warning
- danger
- info
- focus-ring

## Product-specific semantic tokens
- status-new
- status-ingesting
- status-staged
- status-archived
- status-verified
- status-replicated
- status-replica-stale
- status-manual-review
- status-safe-cleanup
- status-blocked
- status-recovering

## Motion tokens
Motion must be tokenized exactly like color and spacing.

### Duration tokens
- instant
- fast
- normal
- slow
- emphasized

### Easing tokens
- productive-enter
- productive-exit
- emphasized-enter
- emphasized-exit
- spring-soft
- spring-press

### Distance tokens
- motion-xs
- motion-sm
- motion-md
- motion-lg

### Opacity tokens
- fade-subtle
- fade-standard
- fade-strong

### Scale tokens
- hover-scale
- press-scale
- success-scale

## Interaction-state tokens
Every interactive component family must support consistent tokens for:
- rest
- hover
- focus-visible
- pressed
- selected
- disabled
- loading
- success
- warning
- error

## Transition-state tokens
Core user journeys must have explicit semantic support for:
- idle
- validating
- in-progress
- success-stable
- success-transient
- partial-success
- recoverable-error
- blocking-error
- empty
- disconnected
- retrying

## Theming guidance
- light theme first
- dark theme supported early, but not before semantics are stable
- no per-page ad hoc palettes
- status colors must not shift meaning across themes
- motion behavior must remain semantically consistent across themes
