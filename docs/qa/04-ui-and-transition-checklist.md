# UI and Transition Checklist

Use this checklist during implementation review for all user-facing surfaces.

## Core clarity
- Does the screen communicate the current state in plain language?
- Is there one clear primary action?
- Is the screen still understandable with animations effectively disabled?

## State coverage
- Normal state exists
- Loading state exists
- Empty state exists
- Error state exists
- Partial-success state exists where applicable
- Blocked state exists where applicable
- Reduced-motion behavior is defined

## Safety language
- Does the UI clearly distinguish uploaded vs archived vs verified vs safe-to-delete?
- Are destructive actions labeled with precise scope?
- Are copy counts and restore implications visible where relevant?

## Motion quality
- Motion reinforces causality rather than decoration
- Motion is brief and consistent
- Warning and danger states are not theatrical
- Large lists or dashboards do not over-animate
- Reduced-motion mode preserves usability

## User satisfaction under stress
- Does failure explain what remained safe?
- Does partial success explain what worked and what did not?
- Does dependency loss explain whether the system paused or failed?
- Does the UI provide a next action instead of a dead end?

## Product consistency
- Tokens are used instead of ad-hoc values
- Component patterns are reused consistently
- Copy tone matches the calm, trustworthy, premium-utility brand
