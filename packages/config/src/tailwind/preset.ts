const spacingTokens = {
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

const semanticColorNames = [
  'surface',
  'surface-muted',
  'surface-raised',
  'surface-critical',
  'text-primary',
  'text-secondary',
  'text-muted',
  'border',
  'border-strong',
  'primary',
  'primary-foreground',
  'success',
  'warning',
  'danger',
  'info',
  'focus-ring',
  'status-new',
  'status-ingesting',
  'status-staged',
  'status-archived',
  'status-verified',
  'status-replicated',
  'status-replica-stale',
  'status-manual-review',
  'status-safe-cleanup',
  'status-blocked',
  'status-recovering',
] as const

export const tailwindPreset = {
  darkMode: ['class'] as ['class'],
  content: [],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--color-surface))',
        foreground: 'hsl(var(--color-text-primary))',
        border: 'hsl(var(--color-border))',
        muted: {
          DEFAULT: 'hsl(var(--color-surface-muted))',
          foreground: 'hsl(var(--color-text-secondary))',
        },
        card: {
          DEFAULT: 'hsl(var(--color-surface-raised))',
          foreground: 'hsl(var(--color-text-primary))',
        },
        primary: {
          DEFAULT: 'hsl(var(--color-primary))',
          foreground: 'hsl(var(--color-primary-foreground))',
        },
        success: 'hsl(var(--color-success))',
        warning: 'hsl(var(--color-warning))',
        danger: 'hsl(var(--color-danger))',
        info: 'hsl(var(--color-info))',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        elevated: 'var(--shadow-elevated)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      spacing: spacingTokens,
      transitionDuration: {
        fast: '140ms',
        normal: '220ms',
        slow: '320ms',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
}

export type TailwindPreset = typeof tailwindPreset

export const knownSemanticColors = [...semanticColorNames]
