# Motion System

## Objective
Motion in Life-Loop must increase clarity, perceived quality, and confidence. It must never create false confidence, hide critical state changes, or distract from the archive truth model.

## Motion philosophy
Use motion in four layers only:
- **feedback** — hover, press, focus, success acknowledgement
- **transition** — dialogs, sheets, sidebars, tabs, step changes
- **orientation** — layout change, reordering, state movement, progress continuity
- **delight** — minimal, reserved for onboarding, empty states, and non-critical celebratory moments

## Product rule
The more safety-critical the screen, the calmer the motion.

Examples:
- Overview, Archive Health, Cleanup, Restore: restrained motion only
- Onboarding, marketing surface, empty states: slightly more expressive motion allowed
- Error and blocking states: motion must reduce uncertainty, not amplify tension

## Motion stack
- Web motion layer: Motion for React
- Component primitives: shadcn/ui based system
- Tokens source: `packages/design-tokens`
- Reduced motion support is mandatory

## Accessibility policy
Respect reduced motion preferences.

When reduced motion is enabled:
- replace large transforms with opacity changes
- disable parallax and decorative movement
- avoid spring-heavy layout motion
- keep feedback states subtle and quick

## Motion categories by screen type

### Safety-critical screens
Examples:
- archive health
- cleanup review
- restore flows
- storage placement detail

Allowed:
- opacity transitions
- small Y-axis entrance/exit
- small scale on hover/press
- progress animation with fixed origin

Not allowed:
- decorative looping motion
- large layout jumps
- background parallax
- animated gradients that imply activity where none exists

### Productive screens
Examples:
- library
- devices
- storage
- settings
- activity

Allowed:
- sectional enter/exit
- filtered list transitions
- row expand/collapse
- drag-and-drop affordance motion
- loading skeleton transitions

### Guided screens
Examples:
- onboarding
- setup wizard
- connection flows
- success confirmation

Allowed:
- more expressive transitions
- step-to-step continuity
- success emphasis
- progress milestone animation

## Default token guidance
- Fast feedback: 100–160ms equivalent token range
- Standard UI transitions: 180–240ms equivalent token range
- Larger contextual transitions: 240–320ms equivalent token range
- Exit transitions should usually feel slightly faster than enter transitions

Do not hardcode these numbers everywhere; use motion tokens.

## Animation rules by interaction

### Hover
- subtle elevation or scale only
- must not shift layout
- avoid hover-only information reveal for critical state

### Press
- quick, compressed response
- always reversible
- should feel tactile, not bouncy

### Modal / sheet / dialog
- motion must clearly indicate source and containment
- overlay fade and panel motion should coordinate
- exit must be faster than enter

### Sidebar / navigation panels
- preserve context
- avoid full-screen repaint feeling
- labels and icons should transition together

### Progress and long-running operations
- must indicate activity without implying completion
- avoid fake deterministic progress if the process is not deterministic
- show explicit labels when state changes from uploading -> staged -> archived -> verified

### Status changes
- use color + icon + copy + motion, not motion alone
- success motion must settle into a stable state
- errors must stop in a calm, readable state

## Performance constraints
- animate transform and opacity preferentially
- avoid layout thrash
- do not mount heavy animated backgrounds in dashboard surfaces
- do not animate huge lists without virtualization strategy
- do not use multiple simultaneous springs on dense data screens

## Anti-patterns
- celebratory motion on destructive actions
- spinners without state labels
- progress bars that reset abruptly without explanation
- attention-seeking motion inside critical workflows
- constantly animated surfaces that imply hidden work

## Definition of done for motion
A screen is not motion-complete unless:
- it behaves correctly in normal mode
- it behaves correctly in reduced motion mode
- positive, negative, and retry states feel coherent
- transitions preserve user orientation
- critical states are more clear after motion, not less
