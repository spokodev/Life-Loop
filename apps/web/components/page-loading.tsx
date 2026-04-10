import { AppShell, Card, Skeleton } from '@life-loop/ui'

import { buildPrimaryNavItems } from './primary-nav'

export function PageLoading({
  eyebrow = 'Loading',
  section = 'Overview',
  summary = 'Loading control-plane state conservatively. The shell stays stable while data is still being fetched.',
  title = 'Life-Loop',
}: {
  eyebrow?: string
  section?: Parameters<typeof buildPrimaryNavItems>[0]
  summary?: string
  title?: string
}) {
  return (
    <AppShell
      eyebrow={eyebrow}
      navItems={buildPrimaryNavItems(section)}
      summary={summary}
      title={title}
    >
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </Card>
        <Card className="space-y-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </Card>
        <Card className="space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-40 w-full" />
        </Card>
      </section>
    </AppShell>
  )
}
