'use server'

import { auth } from '@clerk/nextjs/server'

import { readLiveFeed, type LiveFeed } from '@/lib/home/live-read'

/**
 * The live console's poll. Same reads as the page, under the caller's own
 * session, so RLS decides what it may see exactly as it does for the render.
 * A signed-out caller gets an empty feed rather than an error: the page that
 * polls is already behind the sign-in wall, so this is belt and braces.
 */
export async function pollLiveFeed(): Promise<LiveFeed> {
  const { userId } = await auth()
  if (!userId) return { lines: [], readAt: new Date().toISOString() }
  return readLiveFeed()
}
