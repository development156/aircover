'use server'

import { auth } from '@clerk/nextjs/server'

import { createPost } from '@/app/actions/posts'
import { describeInstruction, parseInstruction } from '@/lib/home/instruct'
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

export interface AskResult {
  /** What Sahoda did, or why it did nothing, in one plain sentence. */
  said: string
  /** Where to go next, when the sentence promised an opening. */
  href: string | null
  /** Whether a row was written. */
  did: 'draft' | 'open' | 'nothing'
}

/**
 * The console's listening half. It does only what a click already can — start
 * a draft through the composer's own action, or open a screen — and it says so
 * before the reader is moved. It never spends credits: the paid buttons keep
 * their own cost previews on their own screens. Anything it does not
 * understand is refused with the three things it can do.
 */
export async function askSahoda(raw: unknown): Promise<AskResult> {
  const { userId } = await auth()
  if (!userId) return { said: 'Sign in to ask Sahoda.', href: null, did: 'nothing' }
  if (typeof raw !== 'string' || raw.length > 500) {
    return { said: 'Keep it to a sentence or two.', href: null, did: 'nothing' }
  }

  const instruction = parseInstruction(raw)
  const said = describeInstruction(instruction)

  if (instruction.kind === 'write') {
    const saved = await createPost(instruction.title)
    if (!saved.ok) return { said: saved.message, href: null, did: 'nothing' }
    return { said, href: `/posts/${saved.postId}`, did: 'draft' }
  }
  if (instruction.kind === 'open') return { said, href: instruction.href, did: 'open' }
  return { said, href: null, did: 'nothing' }
}
