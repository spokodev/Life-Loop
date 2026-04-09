import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

import { Providers } from '../components/providers'

export const metadata: Metadata = {
  title: 'Life-Loop',
  description:
    'Local-first media archival control plane with explicit safety states, verified replicas, and calm operational UX.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
