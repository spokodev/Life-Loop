import type { ReactNode } from 'react'

import { Badge } from './badge'
import { Card } from './card'

export interface AppShellNavItem {
  label: string
  hint: string
  active?: boolean
}

export interface AppShellProps {
  eyebrow: string
  title: string
  summary: string
  navItems: AppShellNavItem[]
  actions?: ReactNode
  children: ReactNode
}

export function AppShell({ eyebrow, title, summary, navItems, actions, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(28,163,168,0.10),transparent_28%),linear-gradient(180deg,hsl(var(--color-surface))_0%,hsl(var(--color-surface-muted))_100%)]">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr] lg:px-8">
        <aside className="space-y-4">
          <Card className="space-y-3 bg-[hsl(var(--color-surface-raised)/0.88)] backdrop-blur-sm">
            <Badge tone="info">{eyebrow}</Badge>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="text-sm text-[hsl(var(--color-text-secondary))]">{summary}</p>
            </div>
          </Card>
          <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {navItems.map((item) => (
              <Card
                className={item.active ? 'border-[hsl(var(--color-primary)/0.35)] bg-card' : ''}
                key={item.label}
              >
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="mt-1 text-sm text-[hsl(var(--color-text-secondary))]">{item.hint}</p>
              </Card>
            ))}
          </nav>
        </aside>
        <main className="space-y-6">
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
          {children}
        </main>
      </div>
    </div>
  )
}
