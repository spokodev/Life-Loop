import type { ReactNode } from 'react'

import { Button } from './button'
import { Card } from './card'

export interface EmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  icon?: ReactNode
  secondary?: ReactNode
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  secondary,
}: EmptyStateProps) {
  return (
    <Card className="flex flex-col gap-4 border-dashed bg-[hsl(var(--color-surface-muted)/0.6)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-xl">
        {icon ?? '○'}
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="max-w-xl text-sm text-[hsl(var(--color-text-secondary))]">{description}</p>
      </div>
      {actionLabel ? <Button onClick={onAction}>{actionLabel}</Button> : null}
      {secondary ? (
        <div className="text-sm text-[hsl(var(--color-text-secondary))]">{secondary}</div>
      ) : null}
    </Card>
  )
}
