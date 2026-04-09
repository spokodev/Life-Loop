import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@life-loop/config',
    '@life-loop/design-tokens',
    '@life-loop/shared-types',
    '@life-loop/ui',
  ],
}

export default nextConfig
