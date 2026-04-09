export const semanticColorTokens = {
  surface: '36 33% 98%',
  'surface-muted': '40 25% 95%',
  'surface-raised': '0 0% 100%',
  'surface-critical': '16 100% 98%',
  'text-primary': '202 30% 14%',
  'text-secondary': '203 20% 33%',
  'text-muted': '202 10% 45%',
  border: '201 18% 84%',
  'border-strong': '198 22% 68%',
  primary: '184 68% 34%',
  'primary-foreground': '0 0% 100%',
  success: '150 55% 34%',
  warning: '33 93% 46%',
  danger: '10 78% 54%',
  info: '199 85% 42%',
  'focus-ring': '184 68% 34%',
  'status-new': '204 94% 55%',
  'status-ingesting': '193 75% 46%',
  'status-staged': '36 95% 52%',
  'status-archived': '184 68% 34%',
  'status-verified': '150 55% 34%',
  'status-replicated': '168 70% 30%',
  'status-replica-stale': '31 92% 48%',
  'status-manual-review': '12 82% 58%',
  'status-safe-cleanup': '142 61% 34%',
  'status-blocked': '4 72% 52%',
  'status-recovering': '220 77% 54%',
} as const

export const spacingTokens = {
  'space-0': '0rem',
  'space-1': '0.25rem',
  'space-2': '0.5rem',
  'space-3': '0.75rem',
  'space-4': '1rem',
  'space-5': '1.25rem',
  'space-6': '1.5rem',
  'space-8': '2rem',
  'space-10': '2.5rem',
  'space-12': '3rem',
} as const

export const radiusTokens = {
  sm: '0.5rem',
  md: '0.875rem',
  lg: '1.25rem',
  xl: '1.75rem',
} as const

export const elevationTokens = {
  soft: '0 18px 45px -28px rgba(15, 23, 42, 0.18)',
  elevated: '0 24px 60px -26px rgba(15, 23, 42, 0.22)',
} as const

export const typographyTokens = {
  sans: '"Avenir Next", "Manrope", "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  mono: '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace',
} as const

export const motionTokens = {
  duration: {
    instant: 0,
    fast: 0.14,
    normal: 0.22,
    slow: 0.32,
    emphasized: 0.4,
  },
  easing: {
    productiveEnter: [0.2, 0.8, 0.2, 1],
    productiveExit: [0.4, 0, 1, 1],
    emphasizedEnter: [0.16, 1, 0.3, 1],
    emphasizedExit: [0.55, 0, 1, 1],
  },
  distance: {
    xs: 2,
    sm: 6,
    md: 12,
    lg: 20,
  },
  scale: {
    hover: 1.01,
    press: 0.985,
    success: 1.02,
  },
  opacity: {
    subtle: 0.72,
    standard: 0.88,
    strong: 1,
  },
} as const
