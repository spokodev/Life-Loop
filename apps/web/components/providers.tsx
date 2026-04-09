import { ClerkProvider } from '@clerk/nextjs'
import { parseWebEnv } from '@life-loop/config'
import type { ReactNode } from 'react'

const env = parseWebEnv(process.env)

export function Providers({ children }: { children: ReactNode }) {
  if (!env.clerkEnabled) {
    // TODO(mvp-deferred): Enforce Clerk-gated routes once the real onboarding flow lands.
    return children
  }

  return <ClerkProvider>{children}</ClerkProvider>
}
