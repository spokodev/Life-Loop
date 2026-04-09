# ADR-013: Motion and Transition-State System

## Status
Accepted

## Context
Life-Loop is a trust-heavy product. Users must understand what is safe, what is pending, what failed, and what they can do next. If motion is handled ad hoc, the UI will either become too flat to feel premium or too animated to remain trustworthy.

## Decision
Life-Loop adopts a motion system as part of the design system.

Rules:
- motion exists to improve clarity, quality, and orientation
- reduced-motion support is mandatory
- positive, negative, partial-success, and dependency-loss states must have explicit UI treatment
- critical archive screens use restrained motion only
- motion tokens are part of the design token package
- success motion must never imply safety that has not been explicitly verified

## Consequences
- new UI work must reference motion and transition-state docs
- QA must review normal and reduced-motion behavior
- transition states become part of component-system scope, not an afterthought
