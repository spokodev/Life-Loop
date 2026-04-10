import type { InputHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition duration-fast placeholder:text-[hsl(var(--color-text-muted))] focus:border-[hsl(var(--color-primary)/0.5)] focus:ring-2 focus:ring-[hsl(var(--color-primary)/0.18)] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}
