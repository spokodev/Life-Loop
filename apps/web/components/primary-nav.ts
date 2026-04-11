import type { AppShellNavItem } from '@life-loop/ui'

export type PrimaryNavSection =
  | 'Overview'
  | 'Library'
  | 'Devices'
  | 'Storage'
  | 'Activity'
  | 'Restore'
  | 'Cleanup'
  | 'Settings'

const navDefinitions: Array<{
  label: PrimaryNavSection
  hint: string
}> = [
  { label: 'Overview', hint: 'Health, action items, and safe-next steps.' },
  { label: 'Library', hint: 'Archive truth and lifecycle status.' },
  { label: 'Devices', hint: 'Desktop agents and ingest endpoints.' },
  { label: 'Storage', hint: 'Primary, replica, preview, and transfer roles.' },
  { label: 'Activity', hint: 'What changed, failed, or recovered.' },
  { label: 'Restore', hint: 'What can be recovered and from where.' },
  { label: 'Cleanup', hint: 'Manual phone cleanup readiness and blockers.' },
  { label: 'Settings', hint: 'Policies, limits, and billing separation.' },
]

export function buildPrimaryNavItems(activeSection: PrimaryNavSection): AppShellNavItem[] {
  return navDefinitions.map((item) => ({
    ...item,
    active: item.label === activeSection,
  }))
}
