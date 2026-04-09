# Design System Foundation

## Why this needs to exist now
Life-Loop has complex trust-heavy UX. Without a design system, the product will drift into inconsistent status language, unsafe destructive actions, and a fragmented mental model.

## Design goals
- calm
- explicit
- high-information, low-chaos
- accessible
- operationally trustworthy
- adaptable to future AI-assisted features

## Visual direction
- modern minimal
- strong status semantics
- soft surfaces, restrained shadows
- rounded corners, not glassmorphism-heavy
- neutral base with a single strong brand accent
- focus on hierarchy and state, not decoration

## Recommended implementation base
- Tailwind CSS
- shadcn/ui as open-code component baseline
- Radix-based primitives under the hood where relevant
- project-owned design tokens in `packages/design-tokens`

## Why this stack
shadcn/ui is designed as open code rather than a sealed component package, which makes it easier to turn into a project-specific design system and easier for AI tools to reason about and improve. Tailwind remains a pragmatic, low-friction styling foundation. Next.js App Router is a strong default for the control plane web app.

## Core product UX rules
- never use the same color semantics for “uploaded” and “safe”
- destructive actions always require explicit affordance separation
- state terms must be stable across all surfaces
- empty states must teach the next safe action
- advanced storage topology is progressively disclosed

## State language
Use a controlled vocabulary:
- New
- Ingesting
- Staged
- Archived
- Verified
- Replicated
- Online
- Needs review
- Safe to remove from phone

Do not invent synonyms per screen.
