import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Pin the workspace root: git worktrees make Next see two lockfiles and
  // guess the main checkout — this keeps resolution inside THIS worktree.
  turbopack: { root: path.resolve(import.meta.dirname, '../..') },
  // @sahoda/shared ships raw TS via package exports — webpack `next build`
  // needs it transpiled (Turbopack dev handles workspace packages natively).
  // Grow this list only when web actually imports another @sahoda package.
  transpilePackages: ['@sahoda/shared'],
  // Dead nav links become typecheck errors (Link hrefs are validated).
  typedRoutes: true,
}

export default nextConfig
