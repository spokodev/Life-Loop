import type { HTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value?: number
  state?: 'known' | 'indeterminate' | 'blocked'
}

export function ProgressBar({ className, value = 0, state = 'known', ...props }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} {...props}>
      <div
        className={cn(
          'h-full rounded-full transition-all duration-normal',
          state === 'blocked' ? 'bg-[hsl(var(--color-danger))]' : 'bg-[hsl(var(--color-primary))]',
          state === 'indeterminate' && 'animate-pulse w-1/2',
        )}
        style={state === 'known' ? { width: `${clamped}%` } : undefined}
      />
    </div>
  )
}
