# ADR-004: Open-Code Design System

## Decision
The web UI will use Tailwind CSS with a project-owned, open-code design system built from tokens and reusable components, with shadcn/ui as the starting distribution model.

## Rationale
A closed design library would slow customization and make AI-assisted improvements harder. Open-code components are easier to adapt to the product's trust-heavy workflows.

## Consequences
- `packages/ui` and `packages/design-tokens` are first-class packages
- design consistency is enforced through tokens and shared patterns
