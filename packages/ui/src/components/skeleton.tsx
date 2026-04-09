import { cn } from '../lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-[linear-gradient(110deg,hsl(var(--color-surface-muted))_8%,hsl(var(--color-surface-raised))_18%,hsl(var(--color-surface-muted))_33%)] bg-[length:200%_100%]',
        className,
      )}
    />
  )
}
