import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  leadingIcon?: ReactNode
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white shadow-soft hover:brightness-[1.03] active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-focus-ring))]',
  secondary:
    'bg-card text-foreground border border-border hover:bg-muted active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-focus-ring))]',
  ghost:
    'bg-transparent text-foreground hover:bg-muted active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-focus-ring))]',
  danger:
    'bg-[hsl(var(--color-danger))] text-white hover:brightness-[1.03] active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-danger))]',
}

export function Button({
  className,
  children,
  variant = 'primary',
  leadingIcon,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-transform duration-fast disabled:pointer-events-none disabled:opacity-60 motion-reduce:transform-none',
        variants[variant],
        className,
      )}
      type={type}
      {...props}
    >
      {leadingIcon ? <span className="text-base">{leadingIcon}</span> : null}
      <span>{children}</span>
    </button>
  )
}
