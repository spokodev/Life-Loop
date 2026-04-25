import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@life-loop/config',
    '@life-loop/design-tokens',
    '@life-loop/shared-types',
    '@life-loop/ui',
  ],
  // Required for Turbopack source maps upload.
  productionBrowserSourceMaps: true,
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  disableLogger: true,
})
