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
  experimental: {
    // Media attach posts the file THROUGH a server action so the mime type,
    // byte length and pixel dimensions are read from the real bytes rather than
    // trusted from the browser — `validateMedia` checks all three, and against
    // client-supplied values it would be validating a claim, not a file.
    //
    // The ceiling is the Constraint Engine's own: the largest `maxMediaMB` is
    // Instagram's 8, so 12 MB leaves room for multipart overhead while still
    // refusing anything no channel could accept. Raise this only if a channel's
    // limit rises — it is a real memory cost per request, and a direct-to-
    // storage signed upload URL is the right answer if media ever gets large.
    serverActions: { bodySizeLimit: '12mb' },
  },
}

export default nextConfig
