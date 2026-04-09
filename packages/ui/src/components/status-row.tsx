import type { ReactNode } from 'react'

import { Badge } from './badge'

export interface StatusRowProps {
  label: string
  value: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  meta?: ReactNode
}

export function StatusRow({ label, value, tone = 'neutral', meta }: StatusRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {meta ? (
          <div className="text-sm text-[hsl(var(--color-text-secondary))]">{meta}</div>
        ) : null}
      </div>
      <Badge tone={tone}>{value}</Badge>
    </div>
  )
}
