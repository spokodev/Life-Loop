import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../lib/cn'

type BannerTone = 'info' | 'warning' | 'danger' | 'success'

const tones: Record<BannerTone, string> = {
  info: 'border-[hsl(var(--color-info)/0.25)] bg-[hsl(var(--color-info)/0.08)]',
  warning: 'border-[hsl(var(--color-warning)/0.25)] bg-[hsl(var(--color-warning)/0.1)]',
  danger: 'border-[hsl(var(--color-danger)/0.25)] bg-[hsl(var(--color-danger)/0.08)]',
  success: 'border-[hsl(var(--color-success)/0.25)] bg-[hsl(var(--color-success)/0.08)]',
}

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  tone?: BannerTone
  title: string
  description: string
  action?: ReactNode
}

export function Banner({
  className,
  tone = 'info',
  title,
  description,
  action,
  ...props
}: BannerProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border px-4 py-4 text-sm md:flex-row md:items-center md:justify-between',
        tones[tone],
        className,
      )}
      {...props}
    >
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-[hsl(var(--color-text-secondary))]">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
