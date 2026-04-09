# UI Package

This package should host Life-Loop's project-owned component system.

## Requirements
- built on top of the documented design-system direction
- uses semantic design tokens from `packages/design-tokens`
- includes reduced-motion-aware components where animation is used
- includes explicit transition-state components for loading, partial success, recoverable error, blocking error, and disconnected dependency states
- does not blur archive truth through decorative motion

## Priority component families
- App shell / navigation primitives
- Status chips and health summaries
- Empty state and transitional state surfaces
- Dialog / sheet / drawer primitives
- Tables / cards / list rows
- Inline notices / banners / toasts
- Progress and verification indicators
