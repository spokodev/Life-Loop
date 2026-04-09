import type { HTMLAttributes } from 'react'

import { cn } from '../lib/cn'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-foreground',
  success: 'bg-[hsl(var(--color-success)/0.14)] text-[hsl(var(--color-success))]',
  warning: 'bg-[hsl(var(--color-warning)/0.14)] text-[hsl(var(--color-warning))]',
  danger: 'bg-[hsl(var(--color-danger)/0.14)] text-[hsl(var(--color-danger))]',
  info: 'bg-[hsl(var(--color-info)/0.14)] text-[hsl(var(--color-info))]',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
